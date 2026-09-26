import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { deleteIntegration } from "@/lib/integrations/store";
import { importUpcomingCalendarEvents } from "@/lib/integrations/calendar-sync";
import { enqueueJob } from "@/lib/job-queue";

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    await deleteIntegration(userId, "google_calendar");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json().catch(() => ({}));
    const action = body.action || "push";

    if (action === "pull") {
      const result = await importUpcomingCalendarEvents(userId);
      return NextResponse.json(result);
    }

    const hour = new Date().toISOString().slice(0, 13);
    const job = await enqueueJob(
      "calendar.full_sync",
      {},
      { userId, idempotencyKey: `calendar-full:${userId}:${hour}`, maxAttempts: 4 }
    );
    return NextResponse.json({ queued: true, job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
