import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import telegramAI from "@/lib/telegram-ai";
import { agentRouter } from "@/lib/agent-router";
const { analyzeDocumentImage } = telegramAI;

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
    const body = await request.json();
    const msg: TelegramMessage | undefined = body.message;

    if (!msg) {
      return NextResponse.json({ ok: true });
    }

    const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id;
    const isImage = msg.photo || (msg.document?.mime_type || "").startsWith("image/");

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

      await prisma.knowledgeItem.create({
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

      await sendTelegramMessage(chatId, `📄 Saved *${result.name}* to your AI Second Brain Vault!`);
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
        `*LifeFlow AI Second Brain Bot*\n\nSend any web link or note — I will automatically summarize it, extract key tags, and save it to your Knowledge Vault.\n\nAsk me anything — *"website components"*, *"show React UI tools"*!\n\n*Commands:*\n/link <code> — Link account\n/summary — View vault stats\n/unlink — Disconnect account`
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

*Ask Knowledge Queries:*
• _"website components"_
• _"show React UI tools"_`
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

    // Delegate message routing to Agent Router (auto web link scraping & RAG knowledge search)
    const routerResult = await agentRouter.route({
      text,
      telegramUserId,
      chatId,
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

export async function GET() {
  const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
  const data = await res.json();
  return NextResponse.json(data);
}
