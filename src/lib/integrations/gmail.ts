import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { getAppBaseUrl } from "@/lib/integrations/oauth-state";
import { getIntegration, markSynced, upsertIntegration } from "@/lib/integrations/store";
import { publishAppEvent } from "@/lib/events";
import { createInboxItem } from "@/lib/inbox-actions";
import { enqueueJob } from "@/lib/job-queue";
import { trackedChatCompletion } from "@/lib/ai-telemetry";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function credentials() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");
  return { clientId, clientSecret, redirectUri: `${getAppBaseUrl()}/api/integrations/gmail/callback` };
}

export function getGmailAuthUrl(state: string) {
  const { clientId, redirectUri } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${GMAIL_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGmailCode(code: string) {
  const { clientId, clientSecret, redirectUri } = credentials();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>;
}

async function getGmailAccessToken(userId: string) {
  const integration = await getIntegration(userId, "gmail");
  if (!integration) return null;
  if (!integration.expiresAt || integration.expiresAt.getTime() > Date.now() + 60000) return integration.accessToken;
  if (!integration.refreshToken) return null;

  const { clientId, clientSecret } = credentials();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await upsertIntegration(userId, "gmail", {
    accessToken: data.access_token,
    refreshToken: integration.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    metadata: (integration.metadata as Record<string, unknown>) || undefined,
  });
  return data.access_token as string;
}

async function gmailFetch(token: string, path: string) {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API error: ${await res.text()}`);
  return res.json();
}

interface GmailSummary {
  id: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  body: string;
  links: string[];
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractBody(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
  if (payload.body?.data && payload.mimeType?.startsWith("text/plain")) return decodeBase64Url(payload.body.data);
  for (const part of (payload.parts || []) as Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>) {
    const text = extractBody(part);
    if (text) return text;
  }
  if (payload.body?.data && payload.mimeType?.startsWith("text/html")) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

async function fetchRecentMessages(token: string, limit: number): Promise<GmailSummary[]> {
  const query = encodeURIComponent("newer_than:7d -category:promotions -category:social");
  const list = await gmailFetch(token, `/messages?maxResults=${limit}&q=${query}`);
  const messages: GmailSummary[] = [];

  for (const ref of list.messages || []) {
    try {
      const full = await gmailFetch(token, `/messages/${ref.id}?format=full`);
      const headers = (full.payload?.headers || []) as Array<{ name: string; value: string }>;
      const header = (name: string) => headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
      const body = extractBody(full.payload || {}).slice(0, 6000);
      messages.push({
        id: full.id,
        subject: header("Subject") || "(no subject)",
        from: header("From"),
        date: new Date(Number(full.internalDate) || Date.now()),
        snippet: full.snippet || "",
        body,
        links: Array.from(new Set(body.match(/https?:\/\/[^\s)>"']+/g) || [])).slice(0, 5),
      });
    } catch {
      continue;
    }
  }
  return messages;
}

interface Classification {
  kind: "bill" | "knowledge" | "action" | "skip";
  amount?: number | null;
  dueInDays?: number | null;
  title?: string;
  summary?: string;
  actionText?: string;
}

function heuristicClassify(message: GmailSummary): Classification {
  const text = `${message.subject} ${message.snippet} ${message.body.slice(0, 1500)}`;
  const amountMatch = text.match(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  if (/invoice|bill|payment due|due date|statement|emi|premium|renew/i.test(text) && amount) {
    return { kind: "bill", amount, dueInDays: /today/i.test(text) ? 0 : /tomorrow/i.test(text) ? 1 : 5, title: message.subject };
  }
  if (/newsletter|digest|weekly|article|read more|blog/i.test(text) && message.links.length) {
    return { kind: "knowledge", title: message.subject, summary: message.snippet };
  }
  if (/please (confirm|review|reply|approve|sign)|action required|deadline|rsvp/i.test(text)) {
    return { kind: "action", actionText: message.subject, dueInDays: 2 };
  }
  return { kind: "skip" };
}

async function classifyWithLLM(userId: string, message: GmailSummary): Promise<Classification | null> {
  const config = getAIConfig();
  if (!config) return null;
  try {
    const { data } = await trackedChatCompletion({
      userId,
      operation: "gmail_classify",
      modelClass: "fast",
      cacheTtlSeconds: 7 * 86400,
      request: {
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Classify this email for a personal OS. Return JSON only:
{"kind":"bill|knowledge|action|skip","amount":number|null,"dueInDays":number|null,"title":"short","summary":"1-2 sentences","actionText":"task text if action"}
- bill: money owed (invoices, EMIs, subscriptions, utilities). Extract amount in INR if present.
- knowledge: newsletters/articles/resources worth saving to a knowledge vault.
- action: someone needs a reply/decision/RSVP from the user.
- skip: everything else (OTP, receipts already paid, notifications, spam).

From: ${message.from}
Subject: ${message.subject}
Body: ${message.body.slice(0, 2500) || message.snippet}`,
          },
        ],
      },
    });
    const raw = (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Classification;
    if (!["bill", "knowledge", "action", "skip"].includes(parsed.kind)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function syncGmailInbox(userId: string, limit = 20) {
  const token = await getGmailAccessToken(userId);
  if (!token) throw new Error("Gmail not connected");

  const messages = await fetchRecentMessages(token, limit);
  const stats = { scanned: messages.length, bills: 0, knowledge: 0, actions: 0, pending: 0, skipped: 0 };

  for (const message of messages) {
    const [existing, existingInbox] = await Promise.all([
      prisma.knowledgeItem.findFirst({
        where: { userId, metadata: { path: ["gmailId"], equals: message.id } },
        select: { id: true },
      }),
      prisma.inboxItem.findUnique({
        where: {
          userId_source_sourceRef: { userId, source: "gmail", sourceRef: message.id },
        },
        select: { id: true },
      }),
    ]);
    if (existing || existingInbox) {
      stats.skipped++;
      continue;
    }

    const classification = (await classifyWithLLM(userId, message)) || heuristicClassify(message);
    const baseMetadata = { gmailId: message.id, from: message.from, receivedAt: message.date.toISOString(), kind: classification.kind };
    const dueAt = new Date(
      Date.now() + Math.max(0, classification.dueInDays ?? (classification.kind === "bill" ? 5 : 2)) * 86400000
    );
    dueAt.setHours(classification.kind === "bill" ? 9 : 18, 0, 0, 0);
    const inboxItem = await createInboxItem(userId, {
      source: "gmail",
      sourceRef: message.id,
      kind: classification.kind,
      title: classification.title || message.subject,
      summary: classification.summary || message.snippet,
      priority: classification.kind === "bill" ? 90 : classification.kind === "action" ? 75 : 30,
      payload: {
        ...classification,
        title: classification.title || message.subject,
        actionText: classification.actionText,
        dueAt: dueAt.toISOString(),
        input: message.links[0] || message.body || message.snippet,
        merchant: message.from.replace(/<.*>/, "").replace(/"/g, "").trim().slice(0, 60),
        description: `From ${message.from}\n\n${message.snippet}`,
      },
    });
    if (inboxItem.status === "PENDING") {
      stats.pending++;
      continue;
    }

    if (classification.kind === "skip") {
      stats.skipped++;
      await prisma.knowledgeItem.create({
        data: {
          userId,
          title: message.subject,
          summary: message.snippet.slice(0, 200),
          type: "note",
          category: "Email",
          tags: ["email", "skipped"],
          archived: true,
          metadata: baseMetadata,
        },
      });
      continue;
    }

    if (classification.kind === "bill") {
      const amount = classification.amount || null;
      const reminder = await prisma.reminder.create({
        data: {
          userId,
          text: `Pay ${classification.title || message.subject}${amount ? ` (₹${Math.round(amount)})` : ""}`,
          remindAt: dueAt,
        },
      });
      await publishAppEvent(userId, "reminder_created", { id: reminder.id, text: reminder.text });
      await enqueueJob("calendar.sync", { type: "reminder", id: reminder.id }, { userId });

      if (amount) {
        const merchant = message.from.replace(/<.*>/, "").replace(/"/g, "").trim().slice(0, 60) || "Email bill";
        await prisma.recurringBill.upsert({
          where: { id: `${userId}-${merchant.toLowerCase().replace(/\s+/g, "-")}`.slice(0, 36) },
          create: { userId, name: merchant, amount, category: "bills", frequency: "monthly", merchant, nextDueAt: dueAt },
          update: { amount, nextDueAt: dueAt },
        }).catch(() => {});
      }

      await prisma.knowledgeItem.create({
        data: {
          userId,
          title: classification.title || message.subject,
          summary: classification.summary || message.snippet,
          aiMemory: `Bill from ${message.from}${amount ? ` for ₹${Math.round(amount)}` : ""}`,
          type: "document",
          category: "Bills",
          documentType: "bill",
          extractedAmount: amount,
          expiryDate: dueAt,
          vendor: message.from.slice(0, 120),
          tags: ["email", "bill"],
          metadata: { ...baseMetadata, reminderId: reminder.id },
        },
      });
      stats.bills++;
      continue;
    }

    if (classification.kind === "action") {
      const task = await prisma.task.create({
        data: {
          userId,
          title: (classification.actionText || `Reply: ${message.subject}`).slice(0, 120),
          description: `From ${message.from}\n\n${message.snippet}`,
          dueAt,
        },
      });
      await publishAppEvent(userId, "task_created", { id: task.id, title: task.title });
      await enqueueJob("calendar.sync", { type: "task", id: task.id }, { userId });
      await prisma.knowledgeItem.create({
        data: {
          userId,
          title: message.subject,
          summary: classification.summary || message.snippet,
          type: "note",
          category: "Email",
          tags: ["email", "action"],
          archived: true,
          metadata: { ...baseMetadata, taskId: task.id },
        },
      });
      stats.actions++;
      continue;
    }

    const item = await prisma.knowledgeItem.create({
      data: {
        userId,
        title: classification.title || message.subject,
        summary: classification.summary || message.snippet,
        aiMemory: `Email from ${message.from.replace(/<.*>/, "").trim()}: ${(classification.summary || message.snippet).slice(0, 160)}`,
        type: "note",
        category: "Email",
        tags: ["email", "newsletter"],
        sourceUrl: message.links[0] || null,
        content: message.body.slice(0, 20000),
        metadata: { ...baseMetadata, links: message.links },
      },
    });
    await Promise.all([
      enqueueJob("embedding.index", { itemId: item.id }, { userId, idempotencyKey: `embedding:${item.id}` }),
      enqueueJob(
        "graph.auto_link",
        {
          text: `${item.title}. ${item.summary || ""}`,
          source: `gmail:${message.id}`,
          hints: { subject: item.title, subjectType: "email", relation: "mentions" },
        },
        { userId, idempotencyKey: `graph:gmail:${message.id}` }
      ),
    ]);
    stats.knowledge++;
  }

  await markSynced(userId, "gmail");
  await publishAppEvent(userId, "gmail_synced", { imported: stats.bills + stats.knowledge + stats.actions, ...stats });
  return stats;
}
