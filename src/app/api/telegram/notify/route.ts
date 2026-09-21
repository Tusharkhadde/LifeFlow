import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";

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
  let queued = 0;
  for (const [userId, chatId] of userChats) {
    const link = links.find((candidate) => candidate.userId === userId && candidate.telegramChatId?.toString() === chatId.toString());
    const lastBriefingAt = link?.lastBriefingAt;
    const shouldSendBriefing = !lastBriefingAt || lastBriefingAt.toDateString() !== now.toDateString();
    await enqueueJob(
      "telegram.notify.user",
      {
        chatId,
        sendBriefing: shouldSendBriefing,
        telegramLinkId: link?.id,
      },
      {
        userId,
        idempotencyKey: `telegram-notify:${userId}:${now.toISOString().slice(0, 13)}`,
        maxAttempts: 4,
      }
    );
    queued++;
  }

  return NextResponse.json({ ok: true, users: userChats.size, queued });
}

export async function GET(request: NextRequest) { return notify(request); }
export async function POST(request: NextRequest) { return notify(request); }
