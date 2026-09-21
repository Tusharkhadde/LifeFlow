import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { listSearchHistory } from "@/lib/search-history";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const history = await listSearchHistory(userId);
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
