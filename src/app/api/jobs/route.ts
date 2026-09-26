import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import {
  claimUserJob,
  completeJob,
  failJob,
  listUserJobs,
  retryJob,
  sanitizeJson,
} from "@/lib/job-queue";
import { executeJob } from "@/lib/job-handlers";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const limit = Number(new URL(request.url).searchParams.get("limit")) || 50;
    return NextResponse.json({ jobs: await listUserJobs(userId, limit) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (body.action === "process" && body.id) {
      const job = await claimUserJob(userId, body.id, `user:${crypto.randomUUID()}`);
      if (!job) {
        const existing = (await listUserJobs(userId, 100)).find((candidate) => candidate.id === body.id);
        return NextResponse.json({ job: existing || null });
      }
      try {
        const result = await executeJob(job);
        const completed = await completeJob(job.id, sanitizeJson(result));
        return NextResponse.json({ job: completed });
      } catch (error) {
        const failed = await failJob(job, error);
        return NextResponse.json({ job: failed }, { status: 500 });
      }
    }
    if (body.action !== "retry" || !body.id) {
      return NextResponse.json({ error: "action=process|retry and id are required" }, { status: 400 });
    }
    const result = await retryJob(userId, body.id);
    return NextResponse.json({ success: result.count > 0 });
  } catch {
    return NextResponse.json({ error: "Failed to retry job" }, { status: 500 });
  }
}
