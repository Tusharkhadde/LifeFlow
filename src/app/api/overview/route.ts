import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getCommandCenter } from "@/lib/command-center";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const overview = await getCommandCenter(userId);
    return NextResponse.json(overview);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
