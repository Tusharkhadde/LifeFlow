import { NextRequest, NextResponse } from "next/server";
import { claimJobs, completeJob, failJob, recoverStaleJobs, sanitizeJson } from "@/lib/job-queue";
import { executeJob } from "@/lib/job-handlers";
import { logger } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function dispatch(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const workerId = `${process.env.VERCEL_REGION || "local"}:${crypto.randomUUID()}`;
  await recoverStaleJobs();
  const jobs = await claimJobs(workerId, 8);
  const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];

  for (const job of jobs) {
    if (Date.now() - startedAt > 48_000) break;
    try {
      const result = await executeJob(job);
      await completeJob(job.id, sanitizeJson(result));
      results.push({ id: job.id, name: job.name, ok: true });
    } catch (error) {
      await failJob(job, error);
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id: job.id, name: job.name, ok: false, error: message });
    }
  }

  logger.info("jobs.dispatched", {
    operation: "jobs.dispatch",
    claimed: jobs.length,
    completed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    elapsedMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    workerId,
    claimed: jobs.length,
    results,
    elapsedMs: Date.now() - startedAt,
  });
}

export async function GET(request: NextRequest) {
  return dispatch(request);
}

export async function POST(request: NextRequest) {
  return dispatch(request);
}
