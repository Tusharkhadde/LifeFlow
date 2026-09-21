import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { getGoogleCalendarAuthUrl } from "@/lib/integrations/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const state = createOAuthState(userId, "google_calendar");
    const url = getGoogleCalendarAuthUrl(state);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Google OAuth" },
      { status: 500 }
    );
  }
}
