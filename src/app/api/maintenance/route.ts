import { JobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { cleanupRateLimitBuckets } from "@/lib/distributed-rate-limit";
import { executeDueDeletionRequests } from "@/lib/account-deletion";

export const maxDuration = 60;

async function maintain(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true }, take: 1000 });
  const day = new Date().toISOString().slice(0, 10);
  for (const user of users) {
    await enqueueJob(
      "retention.cleanup",
      {},
      { userId: user.id, idempotencyKey: `retention:${user.id}:${day}`, maxAttempts: 3 }
    );
  }
  const [deletions, buckets, oldJobs] = await Promise.all([
    executeDueDeletionRequests(),
    cleanupRateLimitBuckets(),
    prisma.job.deleteMany({
      where: {
        status: JobStatus.COMPLETED,
        completedAt: { lt: new Date(Date.now() - 30 * 86400000) },
      },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    retentionJobs: users.length,
    deletions,
    rateLimitBucketsDeleted: buckets.count,
    completedJobsDeleted: oldJobs.count,
  });
}

export async function GET(request: NextRequest) {
  return maintain(request);
}

export async function POST(request: NextRequest) {
  return maintain(request);
}
