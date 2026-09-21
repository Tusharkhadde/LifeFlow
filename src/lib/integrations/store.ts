import { prisma } from "@/lib/db";
import type { IntegrationProvider } from "@/lib/integrations/oauth-state";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export async function getIntegration(userId: string, provider: IntegrationProvider) {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!integration) return null;
  return {
    ...integration,
    accessToken: decryptSecret(integration.accessToken) || "",
    refreshToken: decryptSecret(integration.refreshToken),
  };
}

export async function upsertIntegration(
  userId: string,
  provider: IntegrationProvider,
  data: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scope?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return prisma.integration.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      accessToken: encryptSecret(data.accessToken) || "",
      refreshToken: encryptSecret(data.refreshToken),
      expiresAt: data.expiresAt,
      scope: data.scope,
      metadata: data.metadata,
    },
    update: {
      accessToken: encryptSecret(data.accessToken) || "",
      refreshToken:
        data.refreshToken === undefined
          ? undefined
          : encryptSecret(data.refreshToken),
      expiresAt: data.expiresAt,
      scope: data.scope,
      metadata: data.metadata,
      syncEnabled: true,
    },
  });
}

export async function deleteIntegration(userId: string, provider: IntegrationProvider) {
  const integration = await getIntegration(userId, provider);
  if (integration?.accessToken) {
    try {
      if (provider === "google_calendar" || provider === "gmail") {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(integration.accessToken)}`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
      } else if (provider === "notion") {
        const clientId = process.env.NOTION_CLIENT_ID;
        const clientSecret = process.env.NOTION_CLIENT_SECRET;
        if (clientId && clientSecret) {
          await fetch("https://api.notion.com/v1/oauth/revoke", {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token: integration.accessToken }),
          });
        }
      }
    } catch {
      // Revocation is best-effort; local credentials are still removed.
    }
  }
  await prisma.integration.deleteMany({ where: { userId, provider } });
  if (provider === "google_calendar") {
    await prisma.calendarSyncMap.deleteMany({ where: { userId } });
  }
}

export async function listIntegrations(userId: string) {
  return prisma.integration.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      provider: true,
      expiresAt: true,
      scope: true,
      metadata: true,
      syncEnabled: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function markSynced(userId: string, provider: IntegrationProvider) {
  await prisma.integration.updateMany({
    where: { userId, provider },
    data: { lastSyncAt: new Date() },
  });
}
