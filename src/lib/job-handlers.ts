import { Job } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { markIntegrationFailed, markIntegrationHealthy } from "@/lib/integration-health";

type JobPayload = Record<string, unknown>;
type JobHandler = (job: Job, payload: JobPayload) => Promise<unknown>;

function requireUser(job: Job) {
  if (!job.userId) throw new Error(`Job ${job.name} requires userId`);
  return job.userId;
}

const handlers: Record<string, JobHandler> = {
  "embedding.index": async (job, payload) => {
    const { indexKnowledgeItemEmbedding } = await import("@/lib/hybrid-search");
    await indexKnowledgeItemEmbedding(String(payload.itemId));
    return { itemId: payload.itemId };
  },

  "graph.auto_link": async (job, payload) => {
    const userId = requireUser(job);
    const { autoLinkGraph } = await import("@/lib/context-graph");
    await autoLinkGraph(
      userId,
      String(payload.text || ""),
      String(payload.source || `job:${job.id}`),
      (payload.hints || {}) as { subject?: string; relation?: string; subjectType?: string }
    );
    return { linked: true };
  },

  "calendar.sync": async (job, payload) => {
    const userId = requireUser(job);
    const started = Date.now();
    try {
      const { syncLifeFlowItemToIntegrations } = await import("@/lib/integrations/calendar-sync");
      await syncLifeFlowItemToIntegrations(
        userId,
        String(payload.type) as "task" | "reminder",
        String(payload.id)
      );
      await markIntegrationHealthy(userId, "google_calendar", Date.now() - started);
      return { synced: true };
    } catch (error) {
      await markIntegrationFailed(userId, "google_calendar", error, Date.now() - started);
      throw error;
    }
  },

  "calendar.remove": async (job, payload) => {
    const userId = requireUser(job);
    const { removeGoogleCalendarSync } = await import("@/lib/integrations/calendar-sync");
    await removeGoogleCalendarSync(userId, String(payload.type), String(payload.id));
    return { removed: true };
  },

  "calendar.full_sync": async (job) => {
    const userId = requireUser(job);
    const started = Date.now();
    try {
      const { fullGoogleCalendarSync } = await import("@/lib/integrations/calendar-sync");
      const result = await fullGoogleCalendarSync(userId);
      await markIntegrationHealthy(userId, "google_calendar", Date.now() - started);
      return result;
    } catch (error) {
      await markIntegrationFailed(userId, "google_calendar", error, Date.now() - started);
      throw error;
    }
  },

  "gmail.sync": async (job, payload) => {
    const userId = requireUser(job);
    const started = Date.now();
    try {
      const { syncGmailInbox } = await import("@/lib/integrations/gmail");
      const result = await syncGmailInbox(userId, Number(payload.limit) || 25);
      await markIntegrationHealthy(userId, "gmail", Date.now() - started, result);
      return result;
    } catch (error) {
      await markIntegrationFailed(userId, "gmail", error, Date.now() - started);
      throw error;
    }
  },

  "notion.import": async (job, payload) => {
    const userId = requireUser(job);
    const started = Date.now();
    try {
      const { importNotionPages } = await import("@/lib/integrations/notion-sync");
      const result = await importNotionPages(userId, Number(payload.limit) || 25);
      await markIntegrationHealthy(userId, "notion", Date.now() - started, result);
      return result;
    } catch (error) {
      await markIntegrationFailed(userId, "notion", error, Date.now() - started);
      throw error;
    }
  },

  "bills.detect": async (job) => {
    const { detectRecurringBills } = await import("@/lib/bill-autopilot");
    return detectRecurringBills(requireUser(job));
  },

  "webhooks.dispatch": async (job, payload) => {
    const { fireWebhooks } = await import("@/lib/webhooks");
    return fireWebhooks(
      requireUser(job),
      String(payload.eventType),
      (payload.payload || {}) as Record<string, unknown>,
      payload.eventId ? String(payload.eventId) : undefined
    );
  },

  "document.process": async (job, payload) => {
    const { extractTextFromImage, processDocumentUpload } = await import("@/lib/document-ocr");
    let text = String(payload.text || "");
    if (!text && payload.imageBase64) {
      text = await extractTextFromImage(String(payload.imageBase64));
    }
    if (!text.trim()) throw new Error("Document did not contain readable text");
    const result = await processDocumentUpload(
      requireUser(job),
      text,
      String(payload.fileName || "upload")
    );
    const { ingestContext } = await import("@/lib/context-graph");
    const { publishAppEvent } = await import("@/lib/events");
    await ingestContext(
      requireUser(job),
      `${result.item.title}. ${result.item.aiMemory || result.item.summary || ""}`,
      `document:${result.item.id}`
    );
    await publishAppEvent(requireUser(job), "document_processed", {
      id: result.item.id,
      title: result.item.title,
      expiryDate: result.item.expiryDate,
    });
    return { itemId: result.item.id, extraction: result.extraction };
  },

  "meeting.process": async (job, payload) => {
    const { processMeetingTranscript } = await import("@/lib/meeting-intelligence");
    return processMeetingTranscript(requireUser(job), String(payload.transcript || ""), {
      title: payload.title ? String(payload.title) : undefined,
      source: String(payload.source || "job"),
    });
  },

  "meeting.audio": async (job, payload) => {
    const { processMeetingAudio } = await import("@/lib/meeting-intelligence");
    const audio = Buffer.from(String(payload.audioBase64 || ""), "base64");
    if (!audio.length) throw new Error("Audio payload is empty");
    return processMeetingAudio(requireUser(job), audio, {
      title: payload.title ? String(payload.title) : undefined,
      fileName: String(payload.fileName || "meeting.mp3"),
      source: String(payload.source || "job-audio"),
    });
  },

  "morning.run": async (job, payload) => {
    const { runMorningAgent } = await import("@/lib/morning-agent");
    return runMorningAgent(requireUser(job), {
      force: Boolean(payload.force),
      notifyTelegram: Boolean(payload.notifyTelegram),
    });
  },

  "weekly.review.user": async (job, payload) => {
    const userId = requireUser(job);
    const { generateWeeklyReview } = await import("@/lib/weekly-review");
    const { sendTelegramMessage } = await import("@/lib/telegram");
    const text = await generateWeeklyReview(userId);
    const chatId = payload.chatId ? Number(payload.chatId) : null;
    if (chatId) await sendTelegramMessage(chatId, text);
    return { sent: Boolean(chatId) };
  },

  "telegram.notify.user": async (job, payload) => {
    const userId = requireUser(job);
    const chatId = Number(payload.chatId);
    if (!chatId) throw new Error("chatId required");
    const { sendTelegramMessage } = await import("@/lib/telegram");
    const { getEnhancedDailyBriefing } = await import("@/lib/proactive-intelligence");
    const now = new Date();
    const dueReminders = await prisma.reminder.findMany({
      where: {
        userId,
        completed: false,
        remindAt: { lte: now },
        OR: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { lt: new Date(now.getTime() - 20 * 60 * 60 * 1000) } },
        ],
      },
      orderBy: { remindAt: "asc" },
    });
    if (dueReminders.length) {
      await sendTelegramMessage(
        chatId,
        `🔔 *Reminders*\n${dueReminders.map((reminder) => `• ${reminder.text}`).join("\n")}`
      );
      await prisma.reminder.updateMany({
        where: { id: { in: dueReminders.map((reminder) => reminder.id) } },
        data: { lastNotifiedAt: now },
      });
    }
    if (Boolean(payload.sendBriefing)) {
      await sendTelegramMessage(chatId, await getEnhancedDailyBriefing(userId));
      if (payload.telegramLinkId) {
        await prisma.telegramLink.update({
          where: { id: String(payload.telegramLinkId) },
          data: { lastBriefingAt: now },
        });
      }
    }
    return { reminders: dueReminders.length, briefing: Boolean(payload.sendBriefing) };
  },

  "retention.cleanup": async (job) => {
    const userId = requireUser(job);
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const retentionDays = Math.max(30, settings?.retentionDays || 365);
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const [events, usage, searches, notifications] = await Promise.all([
      prisma.appEvent.deleteMany({ where: { userId, createdAt: { lt: cutoff } } }),
      prisma.usageLog.deleteMany({ where: { userId, createdAt: { lt: cutoff } } }),
      prisma.searchHistory.deleteMany({ where: { userId, createdAt: { lt: cutoff } } }),
      prisma.notification.deleteMany({ where: { userId, read: true, createdAt: { lt: cutoff } } }),
    ]);
    return {
      deleted: {
        events: events.count,
        usage: usage.count,
        searches: searches.count,
        notifications: notifications.count,
      },
    };
  },
};

export async function executeJob(job: Job) {
  const handler = handlers[job.name];
  if (!handler) throw new Error(`No handler registered for ${job.name}`);
  logger.info("job.started", {
    jobId: job.id,
    userId: job.userId || undefined,
    operation: job.name,
    attempt: job.attempts,
  });
  const result = await handler(job, job.payload as JobPayload);
  logger.info("job.completed", {
    jobId: job.id,
    userId: job.userId || undefined,
    operation: job.name,
  });
  return result;
}

export function registeredJobNames() {
  return Object.keys(handlers);
}
