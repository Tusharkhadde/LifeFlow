import { prisma } from "@/lib/db";
import { createHmac } from "crypto";
import { decryptSecret } from "@/lib/secrets";
import { safeFetch } from "@/lib/url-guard";

export async function fireWebhooks(
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
  eventId?: string
) {
  const webhooks = await prisma.webhook.findMany({ where: { userId, active: true } });
  const failures: string[] = [];

  for (const hook of webhooks) {
    const events = (Array.isArray(hook.events) ? hook.events : []) as string[];
    if (events.length > 0 && !events.includes(eventType) && !events.includes("*")) continue;
    if (eventId) {
      const delivered = await prisma.webhookDelivery.findFirst({
        where: { webhookId: hook.id, eventId, deliveredAt: { not: null } },
      });
      if (delivered) continue;
    }

    const started = Date.now();
    const attempt = await prisma.webhookDelivery.count({
      where: { webhookId: hook.id, eventId: eventId || null },
    }) + 1;
    try {
      const body = JSON.stringify({ event: eventType, payload, timestamp: new Date().toISOString() });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-LifeFlow-Event": eventType,
        "X-LifeFlow-Timestamp": timestamp,
      };
      const secret = decryptSecret(hook.secret);
      if (secret) {
        headers["X-LifeFlow-Signature"] = `v1=${createHmac("sha256", secret)
          .update(`${timestamp}.${body}`)
          .digest("hex")}`;
      }
      const response = await safeFetch(
        hook.url,
        { method: "POST", headers, body, signal: AbortSignal.timeout(8000) },
        { httpsOnly: process.env.NODE_ENV === "production", maxRedirects: 0 }
      );
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          userId,
          eventId,
          eventType,
          status: response.status,
          attempt,
          responseMs: Date.now() - started,
          deliveredAt: new Date(),
        },
      });
    } catch (err) {
      console.warn("[Webhook] Delivery failed:", hook.url, err);
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${hook.id}: ${message}`);
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          userId,
          eventId,
          eventType,
          attempt,
          responseMs: Date.now() - started,
          error: message.slice(0, 2000),
        },
      }).catch(() => {});
    }
  }

  if (failures.length) throw new Error(failures.join("; "));
  return { delivered: webhooks.length };
}
