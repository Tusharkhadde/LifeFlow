import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getUsageStats } from "@/lib/usage-stats";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    return NextResponse.json(await getUsageStats(userId));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
