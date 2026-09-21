import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";

async function runWeeklyReview(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const links = await prisma.telegramLink.findMany();
  let queued = 0;
  for (const link of links) {
    if (!link.telegramChatId) continue;
    const week = new Date().toISOString().slice(0, 10);
    await enqueueJob(
      "weekly.review.user",
      { chatId: link.telegramChatId.toString() },
      {
        userId: link.userId,
        idempotencyKey: `weekly:${link.userId}:${week}`,
        maxAttempts: 4,
      }
    );
    queued++;
  }
  return NextResponse.json({ ok: true, queued });
}

export async function GET(request: NextRequest) { return runWeeklyReview(request); }
export async function POST(request: NextRequest) { return runWeeklyReview(request); }
