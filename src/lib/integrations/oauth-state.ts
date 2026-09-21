import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export function getAppBaseUrl() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function getOAuthSecret() {
  const secret = process.env.INTEGRATION_OAUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("INTEGRATION_OAUTH_SECRET or BETTER_AUTH_SECRET must be at least 32 characters");
  }
  return secret;
}

export function createOAuthState(userId: string, provider: string): string {
  const nonce = randomBytes(12).toString("hex");
  const payload = `${userId}:${provider}:${Date.now()}:${nonce}`;
  const sig = createHmac("sha256", getOAuthSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string): { userId: string; provider: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return null;
    const sig = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const expected = createHmac("sha256", getOAuthSecret()).update(payload).digest("hex");
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
    ) return null;
    const [userId, provider] = payload.split(":");
    if (!userId || !provider) return null;
    const timestamp = Number(payload.split(":")[2]);
    if (Date.now() - timestamp > 15 * 60 * 1000) return null;
    return { userId, provider };
  } catch {
    return null;
  }
}

export type IntegrationProvider = "google_calendar" | "notion" | "gmail";

export const INTEGRATION_PROVIDERS: Record<
  IntegrationProvider,
  { name: string; description: string; icon: string }
> = {
  google_calendar: {
    name: "Google Calendar",
    description: "Sync tasks & reminders to your calendar automatically",
    icon: "calendar",
  },
  notion: {
    name: "Notion",
    description: "Import Notion pages into your AI knowledge vault",
    icon: "notion",
  },
  gmail: {
    name: "Gmail",
    description: "Read-only inbox scan: bills become reminders, newsletters become vault items",
    icon: "mail",
  },
};
