import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { getGmailAuthUrl } from "@/lib/integrations/gmail";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const state = createOAuthState(userId, "gmail");
    return NextResponse.json({ url: getGmailAuthUrl(state) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Gmail OAuth" },
      { status: 500 }
    );
  }
}
