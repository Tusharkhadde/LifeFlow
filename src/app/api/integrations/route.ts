import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { listIntegrations } from "@/lib/integrations/store";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/oauth-state";
import { listIntegrationHealth } from "@/lib/integration-health";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const [integrations, healthRecords] = await Promise.all([
      listIntegrations(userId),
      listIntegrationHealth(userId),
    ]);

    const status = Object.keys(INTEGRATION_PROVIDERS).map((provider) => {
      const connected = integrations.find((i) => i.provider === provider);
      const health = healthRecords.find((item) => item.provider === provider);
      return {
        provider,
        ...INTEGRATION_PROVIDERS[provider as keyof typeof INTEGRATION_PROVIDERS],
        connected: Boolean(connected),
        syncEnabled: connected?.syncEnabled ?? false,
        lastSyncAt: connected?.lastSyncAt,
        metadata: connected?.metadata,
        health: health
          ? {
              status: health.status,
              lastSuccessAt: health.lastSuccessAt,
              lastFailureAt: health.lastFailureAt,
              lastError: health.lastError,
              latencyMs: health.latencyMs,
            }
          : null,
      };
    });

    return NextResponse.json({ integrations: status });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
