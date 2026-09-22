import { NextRequest, NextResponse } from "next/server";
import { runScheduledAutomations } from "@/lib/automation-engine";

export const maxDuration = 60;

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runScheduledAutomations();
  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
