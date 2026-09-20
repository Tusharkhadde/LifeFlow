import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { getNotionAuthUrl } from "@/lib/integrations/notion-sync";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const state = createOAuthState(userId, "notion");
    const url = getNotionAuthUrl(state);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notion OAuth not configured" },
      { status: 500 }
    );
  }
}
