import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { handleMessage, analyzeDocumentImage, AVAILABLE_MODELS, getModelInfo, getDefaultModel } from "@/lib/telegram-ai";

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
}

async function handleLinkCode(
  chatId: number,
  telegramUserId: number,
  code: string,
  firstName: string
): Promise<void> {
  const existingLink = await prisma.telegramLink.findUnique({
    where: { telegramUserId },
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
      telegramUserId,
      telegramName: firstName,
    },
  });

  await prisma.linkCode.delete({ where: { code } });

  const user = await prisma.user.findUnique({ where: { id: linkCode.userId } });

  await sendTelegramMessage(
    chatId,
    `Welcome *${user?.name || "User"}*! Your LifeFlow account is linked.\n\nYou can now:\n• Chat naturally to add tasks, expenses, goals, reminders\n• Ask me anything — "what's the news?", "tell me a joke"\n• /tasks — View your tasks\n• /expenses — View expenses\n• /goals — View goals\n• /reminders — View reminders\n• /summary — Quick overview\n• /unlink — Unlink your account\n\nTry: _"I spent ₹500 on groceries"_ or _"What's the news today?"_`
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
    const body = await request.json();
    const msg: TelegramMessage | undefined = body.message;

    if (!msg) {
      return NextResponse.json({ ok: true });
    }

    // Handle photo/document messages
    const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id;
    const isImage = msg.photo || (msg.document?.mime_type || "").startsWith("image/");

    if (fileId && isImage) {
      const telegramUserId = msg.from.id;
      const chatId = msg.chat.id;
      const caption = msg.caption;

      const telegramLink = await prisma.telegramLink.findUnique({ where: { telegramUserId } });
      const userId = telegramLink?.userId;

      if (!userId) {
        await sendTelegramMessage(chatId, "You're not linked yet! Send /link <code> to connect your LifeFlow account.");
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(chatId, "📄 Analyzing document... please wait.");

      const file = await downloadTelegramFile(fileId);
      if (!file) {
        await sendTelegramMessage(chatId, "Failed to download the file. Try again.");
        return NextResponse.json({ ok: true });
      }

      const base64 = file.buffer.toString("base64");
      const result = await analyzeDocumentImage(base64, file.mimeType, caption, telegramLink?.preferredModel || undefined);

      if (!result) {
        await sendTelegramMessage(chatId, "Couldn't analyze this document. Make sure it's a clear image of a document.");
        return NextResponse.json({ ok: true });
      }

      await prisma.document.create({
        data: {
          userId,
          name: result.name,
          type: result.type,
          category: result.category,
          ocrData: result.keyInfo,
          confidence: result.confidence,
          keyDates: {
            issueDate: result.issueDate,
            expiryDate: result.expiryDate,
            other: result.otherDates,
          },
          extractedData: JSON.parse(JSON.stringify(result)),
        },
      });

      let response = `📄 *${result.name}*\nType: ${result.type}\nCategory: ${result.category}\nConfidence: ${Math.round(result.confidence * 100)}%`;
      if (result.issueDate) response += `\n📅 Issue: ${result.issueDate}`;
      if (result.expiryDate) response += `\n⏳ Expiry: ${result.expiryDate}`;
      if (result.otherDates.length > 0) {
        response += `\n\nOther dates:`;
        for (const d of result.otherDates) response += `\n• ${d.label}: ${d.date}`;
      }
      if (Object.keys(result.keyInfo).length > 0) {
        response += `\n\nKey info:`;
        for (const [k, v] of Object.entries(result.keyInfo)) response += `\n• ${k}: ${v}`;
      }
      response += `\n\nSaved to your documents!`;

      await sendTelegramMessage(chatId, response);
      return NextResponse.json({ ok: true });
    }

    if (!msg.text) {
      return NextResponse.json({ ok: true });
    }

    const telegramUserId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Handle /start with deep link payload
    if (text.startsWith("/start")) {
      const payload = text.replace("/start", "").trim();
      if (/^\d{6}$/.test(payload)) {
        await handleLinkCode(chatId, telegramUserId, payload, msg.from.first_name);
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(
        chatId,
        `*LifeFlow AI Bot*\n\nI'm your personal life assistant. I can manage your tasks, expenses, goals, and reminders — and also chat about anything.\n\n*Quick commands:*\n/link <code> — Link your account\n/tasks — Your pending tasks\n/expenses — Expense summary\n/goals — Goal progress\n/reminders — Upcoming reminders\n/summary — Quick overview\n/unlink — Disconnect account\n\nOr just talk to me naturally!`
      );
      return NextResponse.json({ ok: true });
    }

    // Handle /help
    if (text === "/help") {
      await sendTelegramMessage(
        chatId,
        `*How to use LifeFlow Bot:*\n\n*Link your account first:*\n1. Open LifeFlow web app → Settings\n2. Tap "Link Telegram"\n3. Send: /link <code>\n\n*Then just chat:*\n• _"I need to file taxes by April 15th, urgent"_\n• _"Spent ₹1200 on dinner"_\n• _"Save ₹50k for a trip by December"_\n• _"Remind me to exercise every morning"_\n\n*Ask me anything:*\n• _"What's the news today?"_\n• _"Tell me a joke"_\n• _"How are you?"_\n• _"What's AI?"_\n\n*Query your data:*\n• _"What are my tasks?"_\n• _"How much did I spend?"_\n• _"Show my goals"_`
      );
      return NextResponse.json({ ok: true });
    }

    // Handle /link command
    if (text.startsWith("/link")) {
      const code = text.replace("/link", "").trim();
      if (!code) {
        await sendTelegramMessage(
          chatId,
          "Usage: /link <code>\n\nGet your code from LifeFlow → Settings → Link Telegram"
        );
        return NextResponse.json({ ok: true });
      }
      await handleLinkCode(chatId, telegramUserId, code, msg.from.first_name);
      return NextResponse.json({ ok: true });
    }

    // Handle /unlink
    if (text === "/unlink") {
      const link = await prisma.telegramLink.findUnique({
        where: { telegramUserId },
      });
      if (!link) {
        await sendTelegramMessage(chatId, "You're not linked yet.");
      } else {
        await prisma.telegramLink.delete({ where: { telegramUserId } });
        await sendTelegramMessage(chatId, "Account unlinked. Your data is still safe in LifeFlow.");
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /models — list available models
    if (text === "/models") {
      const link = await prisma.telegramLink.findUnique({ where: { telegramUserId } });
      const current = link?.preferredModel || getDefaultModel();
      const currentInfo = getModelInfo(current);
      let response = `*Available Models:*\n\n`;
      for (const m of AVAILABLE_MODELS) {
        const active = m.id === current ? " ✅" : "";
        const vision = m.supportsVision ? " 📷" : "";
        response += `• ${m.name}${active}${vision}\n  \`${m.id}\`\n`;
      }
      response += `\nCurrent: *${currentInfo?.name || current}*\n\nUse /model <name> to switch.\n📷 = vision capable`;
      await sendTelegramMessage(chatId, response);
      return NextResponse.json({ ok: true });
    }

    // Handle /model <name> — switch model
    if (text.startsWith("/model")) {
      const modelArg = text.replace("/model", "").trim();
      if (!modelArg) {
        await sendTelegramMessage(chatId, "Usage: /model <model_id>\n\nSee /models for available models.");
        return NextResponse.json({ ok: true });
      }

      const link = await prisma.telegramLink.findUnique({ where: { telegramUserId } });
      if (!link) {
        await sendTelegramMessage(chatId, "You're not linked yet! Send /link <code> first.");
        return NextResponse.json({ ok: true });
      }

      const modelInfo = getModelInfo(modelArg);
      if (!modelInfo) {
        const ids = AVAILABLE_MODELS.map(m => `\`${m.id}\``).join("\n");
        await sendTelegramMessage(chatId, `Unknown model. Available:\n${ids}\n\nSee /models for details.`);
        return NextResponse.json({ ok: true });
      }

      await prisma.telegramLink.update({
        where: { telegramUserId },
        data: { preferredModel: modelInfo.id },
      });

      const visionNote = modelInfo.supportsVision ? " (supports document analysis)" : "";
      await sendTelegramMessage(chatId, `Switched to *${modelInfo.name}*${visionNote}.`);
      return NextResponse.json({ ok: true });
    }

    // Look up linked user
    const telegramLink = await prisma.telegramLink.findUnique({
      where: { telegramUserId },
    });

    const userId = telegramLink?.userId || "";
    const preferredModel = telegramLink?.preferredModel || undefined;

    // Commands that require auth
    const authCommands = ["/tasks", "/expenses", "/goals", "/reminders", "/summary"];
    const isAuthCommand = authCommands.some((c) => text.toLowerCase().startsWith(c));

    if (isAuthCommand && !userId) {
      await sendTelegramMessage(
        chatId,
        "You're not linked yet! Send /link <code> to connect your LifeFlow account.\n\nGet your code from the web app → Settings → Link Telegram"
      );
      return NextResponse.json({ ok: true });
    }

    // All commands (already handled above, but catch unknown ones)
    if (text.startsWith("/")) {
      await sendTelegramMessage(chatId, "Unknown command. Send /help for available commands.");
      return NextResponse.json({ ok: true });
    }

    // Not linked? Prompt to link
    if (!userId) {
      await sendTelegramMessage(
        chatId,
        "You're not linked yet! Send /link <code> to connect your LifeFlow account.\n\nGet your code from the web app → Settings → Link Telegram"
      );
      return NextResponse.json({ ok: true });
    }

    // Free-form message → AI handles everything (chat, create, query)
    const response = await handleMessage(text, userId, preferredModel);
    await sendTelegramMessage(chatId, response);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

// GET endpoint to check webhook status
export async function GET() {
  const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
  const data = await res.json();
  return NextResponse.json(data);
}
