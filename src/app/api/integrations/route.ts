import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { listIntegrations } from "@/lib/integrations/store";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/oauth-state";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const integrations = await listIntegrations(userId);

    const status = Object.keys(INTEGRATION_PROVIDERS).map((provider) => {
      const connected = integrations.find((i) => i.provider === provider);
      return {
        provider,
        ...INTEGRATION_PROVIDERS[provider as keyof typeof INTEGRATION_PROVIDERS],
        connected: Boolean(connected),
        syncEnabled: connected?.syncEnabled ?? false,
        lastSyncAt: connected?.lastSyncAt,
        metadata: connected?.metadata,
      };
    });

    return NextResponse.json({ integrations: status });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
