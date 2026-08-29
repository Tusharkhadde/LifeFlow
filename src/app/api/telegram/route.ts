import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import telegramAI from "@/lib/telegram-ai";
import { agentRouter } from "@/lib/agent-router";
import { processAndSynthesizeInput } from "@/lib/knowledge-engine";
import { forgetPersonalMemory, listPersonalMemories } from "@/lib/personal-memory";
import { createReminder, createTask, formatUserDate, getDailyBriefing, validateTimezone } from "@/lib/productivity-actions";
import { ingestContext, listContextGraph } from "@/lib/context-graph";
import { resolvePendingAction } from "@/lib/inbox-triage";
const { analyzeDocumentImage, transcribeAudio } = telegramAI;

function hasValidWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
  };
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  document?: TelegramDocument;
  voice?: TelegramVoice;
  audio?: TelegramVoice;
}

async function handleLinkCode(
  chatId: number,
  telegramUserId: number,
  code: string,
  firstName: string
): Promise<void> {
  const existingLink = await prisma.telegramLink.findUnique({
    where: { telegramUserId: BigInt(telegramUserId) },
  });

  if (existingLink) {
    await sendTelegramMessage(chatId, "Your account is already linked!");
    return;
  }

  const linkCode = await prisma.linkCode.findUnique({ where: { code } });

  if (!linkCode || linkCode.expiresAt < new Date()) {
    await sendTelegramMessage(
      chatId,
      "Invalid or expired code. Generate a new one from LifeFlow → Settings → Link Telegram"
    );
    return;
  }

  await prisma.telegramLink.create({
    data: {
      userId: linkCode.userId,
      telegramUserId: BigInt(telegramUserId),
      telegramChatId: BigInt(chatId),
      telegramName: firstName,
    },
  });

  await prisma.linkCode.delete({ where: { code } });

  const user = await prisma.user.findUnique({ where: { id: linkCode.userId } });

  await sendTelegramMessage(
    chatId,
    `Welcome *${user?.name || "User"}*! Your LifeFlow AI Second Brain account is linked.\n\nYou can now:\n• Send any web link (e.g. \`https://ui.shadcn.com\`) — Auto-scraped & saved!\n• Ask anything — *"website components"*, *"show React UI tools"*\n• /summary — View your Knowledge Vault stats\n• /unlink — Unlink account\n\nTry sending: _"https://ui.shadcn.com"_ or asking _"website components"_!`
  );
}

async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    const filePath = fileData.result.file_path;
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };
    const mimeType = mimeMap[ext || ""] || "image/jpeg";

    const dlRes = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
    if (!dlRes.ok) return null;

    const arrayBuffer = await dlRes.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType };
  } catch (err) {
    console.error("[telegram] Download failed:", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidWebhookSecret(request)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const body = await request.json();
    const msg: TelegramMessage | undefined = body.message;

    if (!msg || !msg.from?.id || !msg.chat?.id || typeof msg.message_id !== "number") {
      return NextResponse.json({ ok: true });
    }

    const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id || msg.voice?.file_id || msg.audio?.file_id;
    const isImage = msg.photo || (msg.document?.mime_type || "").startsWith("image/");
    const isVoice = Boolean(msg.voice || msg.audio);
    const isPdf = msg.document?.mime_type === "application/pdf" || msg.document?.file_name?.toLowerCase().endsWith(".pdf");

    if (fileId && isVoice) {
      const telegramUserId = msg.from.id;
      const chatId = msg.chat.id;
      const telegramLink = await prisma.telegramLink.findUnique({ where: { telegramUserId: BigInt(telegramUserId) } });
      if (!telegramLink) {
        await sendTelegramMessage(chatId, "You're not linked yet! Send /link <code> to connect your LifeFlow account.");
        return NextResponse.json({ ok: true });
      }
      await prisma.telegramLink.update({ where: { id: telegramLink.id }, data: { telegramChatId: BigInt(chatId) } });
      await sendTelegramMessage(chatId, "🎙️ Transcribing your voice message...");
      const file = await downloadTelegramFile(fileId);
      const transcript = file ? await transcribeAudio(file.buffer, msg.audio ? "audio.mp3" : "voice.ogg") : null;
      if (!transcript) {
        await sendTelegramMessage(chatId, "I couldn't transcribe that voice message. Check your AI transcription model settings and try again.");
        return NextResponse.json({ ok: true });
      }
      const result = await agentRouter.route({ text: transcript, telegramUserId, chatId, telegramMessageId: msg.message_id });
      await sendTelegramMessage(chatId, `🎙️ *Transcript:* ${transcript}`);
      if (result.message) await sendTelegramMessage(chatId, result.message);
      return NextResponse.json({ ok: true });
    }

    if (fileId && isImage) {
      const telegramUserId = msg.from.id;
      const chatId = msg.chat.id;
      const caption = msg.caption;

      const telegramLink = await prisma.telegramLink.findUnique({ where: { telegramUserId: BigInt(telegramUserId) } });
      const userId = telegramLink?.userId;

      if (!userId) {
        await sendTelegramMessage(chatId, "You're not linked yet! Send /link <code> to connect your LifeFlow account.");
        return NextResponse.json({ ok: true });
      }

      await prisma.telegramLink.update({ where: { id: telegramLink.id }, data: { telegramChatId: BigInt(chatId) } });

      await sendTelegramMessage(chatId, "📄 Analyzing document... please wait.");

      const file = await downloadTelegramFile(fileId);
      if (!file) {
        await sendTelegramMessage(chatId, "Failed to download the file. Try again.");
        return NextResponse.json({ ok: true });
      }

      const base64 = file.buffer.toString("base64");
      const result = await analyzeDocumentImage(base64, file.mimeType, caption, telegramLink?.preferredModel || undefined);

      if (!result) {
        await sendTelegramMessage(chatId, "Couldn't analyze this document.");
        return NextResponse.json({ ok: true });
      }

      const item = await prisma.knowledgeItem.create({
        data: {
          userId,
          title: result.name,
          summary: `Document analysis (${result.type})`,
          aiMemory: `${result.name} - ${result.category} document`,
          type: "document",
          category: result.category,
          tags: ["document", result.type],
        },
      });
      await ingestContext(userId, `${item.title}. ${item.aiMemory || item.summary || ""}`, caption || "telegram-image-document");

      await sendTelegramMessage(chatId, `📄 Saved *${result.name}* to your AI Second Brain Vault!`);
      return NextResponse.json({ ok: true });
    }

    if (fileId && isPdf) {
      const telegramUserId = msg.from.id;
      const chatId = msg.chat.id;
      const telegramLink = await prisma.telegramLink.findUnique({ where: { telegramUserId: BigInt(telegramUserId) } });
      if (!telegramLink) {
        await sendTelegramMessage(chatId, "You're not linked yet! Send /link <code> to connect your LifeFlow account.");
        return NextResponse.json({ ok: true });
      }
      await prisma.telegramLink.update({ where: { id: telegramLink.id }, data: { telegramChatId: BigInt(chatId) } });
      await sendTelegramMessage(chatId, "📄 Reading your PDF...");
      const file = await downloadTelegramFile(fileId);
      const extractedText = file ? extractPdfText(file.buffer) : "";
      if (!extractedText) {
        await sendTelegramMessage(chatId, "I couldn't read text from that PDF. Try sending a searchable PDF or an image of the page.");
        return NextResponse.json({ ok: true });
      }
      const processed = await processAndSynthesizeInput(extractedText.slice(0, 12000), "document");
      const item = await prisma.knowledgeItem.create({
        data: {
          userId: telegramLink.userId,
          title: msg.document?.file_name || processed.title,
          summary: processed.summary,
          aiMemory: processed.aiMemory,
          type: "document",
          category: processed.category,
          tags: ["pdf", ...processed.tags],
          content: extractedText.slice(0, 50000),
        },
      });
      await ingestContext(telegramLink.userId, `${item.title}. ${item.aiMemory || item.summary || ""}`, msg.document?.file_name || "telegram-pdf");
      await sendTelegramMessage(chatId, `📄 Saved and indexed *${item.title}*. You can ask me about its contents anytime.`);
      return NextResponse.json({ ok: true });
    }

    if (!msg.text) {
      return NextResponse.json({ ok: true });
    }

    const telegramUserId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text.startsWith("/start")) {
      const payload = text.replace("/start", "").trim();
      if (/^\d{6}$/.test(payload)) {
        await handleLinkCode(chatId, telegramUserId, payload, msg.from.first_name);
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(
        chatId,
        `*LifeFlow AI Second Brain Bot*\n\nSend any web link, voice message, searchable PDF, or note. I will summarize it, extract key facts, and connect it to your Knowledge Vault.\n\nAsk me anything — *"website components"*, *"show React UI tools"*, or *"what matters today?"*\n\n*Commands:*\n/link <code> — Link account\n/memory — Show remembered facts\n/forget <text> — Forget a fact\n/task <text> — Create a task\n/remind <text> at <time> — Set a reminder\n/timezone <Area/City> — Set your timezone\n/confirm or /cancel — Approve or reject an AI action\n/briefing — Daily overview\n/context — Show connected knowledge\n/clearconversation — Delete chat history\n/summary — View vault stats\n/unlink — Disconnect account`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/help") {
      await sendTelegramMessage(
        chatId,
        `*LifeFlow AI Second Brain Bot:*

*Link account:*
1. Web App → Settings → Link Telegram
2. Send: /link <code>

*Save Web Links & Notes:*
• Send \`https://ui.shadcn.com\` — Auto-scrapes & extracts memory!
• Send notes or ideas.
• Send voice messages or searchable PDFs for transcription and indexing.

*Ask Knowledge Queries:*
• _"website components"_
• _"show React UI tools"_

*Productivity:*
• _"Remind me to call Alex tomorrow"_
• _"Add task: finish the report"_
• _"I prefer concise answers"_
• Reply /confirm when LifeFlow proposes an action

*Context graph:*
• _"Project Atlas is for my portfolio"_
• /context — Show connected knowledge_`
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/link")) {
      const code = text.replace("/link", "").trim();
      if (!code) {
        await sendTelegramMessage(chatId, "Usage: /link <code>");
        return NextResponse.json({ ok: true });
      }
      await handleLinkCode(chatId, telegramUserId, code, msg.from.first_name);
      return NextResponse.json({ ok: true });
    }

    if (text === "/unlink") {
      const link = await prisma.telegramLink.findUnique({
        where: { telegramUserId: BigInt(telegramUserId) },
      });
      if (!link) {
        await sendTelegramMessage(chatId, "You're not linked yet.");
      } else {
        await prisma.telegramLink.delete({ where: { telegramUserId: BigInt(telegramUserId) } });
        await sendTelegramMessage(chatId, "Account unlinked successfully.");
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/summary")) {
      const link = await prisma.telegramLink.findUnique({ where: { telegramUserId: BigInt(telegramUserId) } });
      if (!link) {
        await sendTelegramMessage(chatId, "You're not linked yet! Send /link <code> first.");
        return NextResponse.json({ ok: true });
      }

      const count = await prisma.knowledgeItem.count({ where: { userId: link.userId, archived: false } });
      await sendTelegramMessage(chatId, `📊 *AI Second Brain Vault Summary:*\n• Saved Knowledge Items: ${count}`);
      return NextResponse.json({ ok: true });
    }

    // Look up linked user for natural messages
    const telegramLink = await prisma.telegramLink.findUnique({
      where: { telegramUserId: BigInt(telegramUserId) },
    });

    if (!telegramLink) {
      await sendTelegramMessage(
        chatId,
        "You're not linked yet! Send /link <code> to connect your LifeFlow account."
      );
      return NextResponse.json({ ok: true });
    }

    await prisma.telegramLink.update({ where: { id: telegramLink.id }, data: { telegramChatId: BigInt(chatId) } });

    if (text.startsWith("/timezone")) {
      const timezone = text.slice("/timezone".length).trim();
      if (!timezone || !validateTimezone(timezone)) {
        await sendTelegramMessage(chatId, "Usage: /timezone Area/City\nExample: /timezone Asia/Kolkata");
        return NextResponse.json({ ok: true });
      }
      await prisma.user.update({ where: { id: telegramLink.userId }, data: { timezone } });
      await sendTelegramMessage(chatId, `✅ Timezone set to ${timezone}. Future reminders will use this timezone.`);
      return NextResponse.json({ ok: true });
    }

    if (text === "/confirm" || text === "/cancel") {
      const result = await resolvePendingAction(telegramLink.userId, chatId, text === "/confirm");
      await sendTelegramMessage(chatId, result.message);
      return NextResponse.json({ ok: true });
    }

    if (text === "/memory") {
      const memories = await listPersonalMemories(telegramLink.userId);
      await sendTelegramMessage(chatId, memories.length
        ? `*What I remember about you:*\n${memories.map((memory) => `• *${memory.key}:* ${memory.value}`).join("\n")}`
        : "I don't have any personal memories about you yet.");
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/forget ")) {
      const removed = await forgetPersonalMemory(telegramLink.userId, text.slice(8).trim());
      await sendTelegramMessage(chatId, removed ? `Forgot ${removed} personal memor${removed === 1 ? "y" : "ies"}.` : "I couldn't find that memory.");
      return NextResponse.json({ ok: true });
    }

    if (text === "/clearconversation") {
      const conversation = await prisma.conversation.findUnique({ where: { userId_telegramChatId: { userId: telegramLink.userId, telegramChatId: BigInt(chatId) } } });
      if (conversation) await prisma.conversationMessage.deleteMany({ where: { conversationId: conversation.id } });
      await sendTelegramMessage(chatId, "Conversation history cleared. Your saved knowledge and personal memories are unchanged.");
      return NextResponse.json({ ok: true });
    }

    if (text === "/briefing") {
      await sendTelegramMessage(chatId, await getDailyBriefing(telegramLink.userId));
      return NextResponse.json({ ok: true });
    }

    if (text === "/context") {
      const relationships = await listContextGraph(telegramLink.userId);
      await sendTelegramMessage(chatId, relationships.length
        ? `*Your context graph:*\n${relationships.map((edge) => `• ${edge.fromEntity.name} ${edge.relation.replace("_", " ")} ${edge.toEntity.name}`).join("\n")}`
        : "Your context graph is empty. Save notes or describe relationships like: `Project Atlas is for my portfolio`.");
      return NextResponse.json({ ok: true });
    }

    const taskMatch = text.match(/^\/task\s+(.+?)(?:\s+due\s+(.+))?$/i);
    if (taskMatch) {
      const task = await createTask(telegramLink.userId, taskMatch[1], taskMatch[2]);
      await sendTelegramMessage(chatId, `✅ Task created: *${task.title}*`);
      return NextResponse.json({ ok: true });
    }

    const reminderMatch = text.match(/^\/remind\s+(.+?)\s+(?:at|in)\s+(.+)$/i);
    if (reminderMatch) {
      try {
        const reminder = await createReminder(telegramLink.userId, reminderMatch[1], reminderMatch[2]);
        await sendTelegramMessage(chatId, `✅ Reminder set for ${await formatUserDate(telegramLink.userId, reminder.remindAt)}: *${reminder.text}*`);
      } catch (error) {
        await sendTelegramMessage(chatId, error instanceof Error ? error.message : "I couldn't create that reminder.");
      }
      return NextResponse.json({ ok: true });
    }


    // Delegate message routing to Agent Router (auto web link scraping & RAG knowledge search)
    const routerResult = await agentRouter.route({
      text,
      telegramUserId,
      chatId,
      telegramMessageId: msg.message_id,
    });

    if (routerResult.message) {
      await sendTelegramMessage(chatId, routerResult.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const textBlocks = [...raw.matchAll(/\(([^()]{2,500})\)/g)]
    .map((match) => match[1].replace(/\\([()\\])/g, "$1").replace(/\\[nrt]/g, " "))
    .filter((text) => /[a-zA-Z]{2}/.test(text));
  return textBlocks.join(" ").replace(/\s+/g, " ").trim();
}

export async function GET() {
  const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
  const data = await res.json();
  return NextResponse.json(data);
}
