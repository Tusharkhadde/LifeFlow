import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { detectRecurringBills, getUpcomingBills } from "@/lib/bill-autopilot";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const bills = await getUpcomingBills(userId);
    return NextResponse.json({ bills });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const detected = await detectRecurringBills(userId);
    return NextResponse.json({ detected, count: detected.length });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
