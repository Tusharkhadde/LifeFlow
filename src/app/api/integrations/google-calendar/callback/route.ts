import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState, getAppBaseUrl } from "@/lib/integrations/oauth-state";
import { exchangeGoogleCalendarCode } from "@/lib/integrations/google-calendar";
import { upsertIntegration } from "@/lib/integrations/store";
import { enqueueJob } from "@/lib/job-queue";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const base = getAppBaseUrl();

  if (error) {
    return NextResponse.redirect(`${base}/dashboard/integrations?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${base}/dashboard/integrations?error=missing_code`);
  }

  const verified = verifyOAuthState(state);
  if (!verified || verified.provider !== "google_calendar") {
    return NextResponse.redirect(`${base}/dashboard/integrations?error=invalid_state`);
  }

  try {
    const tokens = await exchangeGoogleCalendarCode(code);
    await upsertIntegration(verified.userId, "google_calendar", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      metadata: { calendarId: "primary" },
    });

    await enqueueJob(
      "calendar.full_sync",
      {},
      {
        userId: verified.userId,
        idempotencyKey: `calendar-initial:${verified.userId}`,
        maxAttempts: 4,
      }
    );

    return NextResponse.redirect(`${base}/dashboard/integrations?connected=google_calendar&queued=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${base}/dashboard/integrations?error=${encodeURIComponent(msg)}`);
  }
}
