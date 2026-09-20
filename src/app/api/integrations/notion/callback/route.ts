import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState, getAppBaseUrl } from "@/lib/integrations/oauth-state";
import { exchangeNotionCode, importNotionPages } from "@/lib/integrations/notion-sync";
import { upsertIntegration } from "@/lib/integrations/store";

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
  if (!verified || verified.provider !== "notion") {
    return NextResponse.redirect(`${base}/dashboard/integrations?error=invalid_state`);
  }

  try {
    const tokens = await exchangeNotionCode(code);
    await upsertIntegration(verified.userId, "notion", {
      accessToken: tokens.access_token,
      metadata: {
        workspaceId: tokens.workspace_id,
        workspaceName: tokens.workspace_name,
        botId: tokens.bot_id,
      },
    });

    const result = await importNotionPages(verified.userId, 15);

    return NextResponse.redirect(
      `${base}/dashboard/integrations?connected=notion&imported=${result.imported}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${base}/dashboard/integrations?error=${encodeURIComponent(msg)}`);
  }
}
