import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { deleteIntegration } from "@/lib/integrations/store";
import { enqueueJob } from "@/lib/job-queue";

export const maxDuration = 60;

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    await deleteIntegration(userId, "gmail");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json().catch(() => ({}));
    const hour = new Date().toISOString().slice(0, 13);
    const job = await enqueueJob(
      "gmail.sync",
      { limit: Math.min(50, Number(body.limit) || 20) },
      { userId, idempotencyKey: `gmail-sync:${userId}:${hour}`, maxAttempts: 4 }
    );
    return NextResponse.json({ queued: true, job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gmail sync failed" },
      { status: 500 }
    );
  }
}
