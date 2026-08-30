import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { getDailyBriefing } from "@/lib/productivity-actions";

async function notify(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const links = await prisma.telegramLink.findMany({ orderBy: { linkedAt: "asc" } });
  const userChats = new Map<string, number>();
  for (const link of links) {
    if (link.telegramChatId !== null && !userChats.has(link.userId)) userChats.set(link.userId, Number(link.telegramChatId));
  }

  const now = new Date();
  let sent = 0;
  for (const [userId, chatId] of userChats) {
    const dueReminders = await prisma.reminder.findMany({
      where: { userId, completed: false, remindAt: { lte: now }, OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: new Date(now.getTime() - 20 * 60 * 60 * 1000) } }] },
      orderBy: { remindAt: "asc" },
    });
    if (dueReminders.length) {
      await sendTelegramMessage(chatId, `🔔 *Reminders*\n${dueReminders.map((reminder) => `• ${reminder.text}`).join("\n")}`);
      await prisma.reminder.updateMany({ where: { id: { in: dueReminders.map((reminder) => reminder.id) } }, data: { lastNotifiedAt: now } });
      sent += dueReminders.length;
    }
    const link = links.find((candidate) => candidate.userId === userId && candidate.telegramChatId?.toString() === chatId.toString());
    const lastBriefingAt = link?.lastBriefingAt;
    const shouldSendBriefing = !lastBriefingAt || lastBriefingAt.toDateString() !== now.toDateString();
    if (shouldSendBriefing && link) {
      await sendTelegramMessage(chatId, await getDailyBriefing(userId));
      await prisma.telegramLink.update({ where: { id: link.id }, data: { lastBriefingAt: now } });
    }
  }

  return NextResponse.json({ ok: true, users: userChats.size, sent });
}

export async function GET(request: NextRequest) { return notify(request); }
export async function POST(request: NextRequest) { return notify(request); }
