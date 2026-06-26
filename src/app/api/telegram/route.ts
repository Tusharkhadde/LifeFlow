import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { handleMessage } from "@/lib/telegram-ai";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const msg: TelegramMessage | undefined = body.message;

    if (!msg?.text) {
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

    // Look up linked user
    const telegramLink = await prisma.telegramLink.findUnique({
      where: { telegramUserId },
    });

    const userId = telegramLink?.userId || "";

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
    const response = await handleMessage(text, userId);
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
