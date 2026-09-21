import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState, getAppBaseUrl } from "@/lib/integrations/oauth-state";
import { exchangeGmailCode } from "@/lib/integrations/gmail";
import { upsertIntegration } from "@/lib/integrations/store";
import { enqueueJob } from "@/lib/job-queue";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const base = getAppBaseUrl();

  if (error) return NextResponse.redirect(`${base}/dashboard/integrations?error=${encodeURIComponent(error)}`);
  if (!code || !state) return NextResponse.redirect(`${base}/dashboard/integrations?error=missing_code`);

  const verified = verifyOAuthState(state);
  if (!verified || verified.provider !== "gmail") {
    return NextResponse.redirect(`${base}/dashboard/integrations?error=invalid_state`);
  }

  try {
    const tokens = await exchangeGmailCode(code);
    await upsertIntegration(verified.userId, "gmail", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      metadata: { readOnly: true },
    });

    await enqueueJob(
      "gmail.sync",
      { limit: 15 },
      { userId: verified.userId, idempotencyKey: `gmail-initial:${verified.userId}`, maxAttempts: 4 }
    );
    return NextResponse.redirect(`${base}/dashboard/integrations?connected=gmail&queued=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${base}/dashboard/integrations?error=${encodeURIComponent(msg)}`);
  }
}
