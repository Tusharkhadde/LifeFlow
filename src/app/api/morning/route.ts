import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getTodayMorningRun, runMorningAgent } from "@/lib/morning-agent";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const run = await getTodayMorningRun(userId);
    return NextResponse.json({ run });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json().catch(() => ({}));
    const run = await runMorningAgent(userId, {
      force: Boolean(body.force),
      notifyTelegram: body.notifyTelegram !== false,
    });
    return NextResponse.json({ run }, { status: run.reused ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Morning OS failed" },
      { status: 500 }
    );
  }
}
