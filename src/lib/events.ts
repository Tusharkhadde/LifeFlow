import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { enqueueJob } from "@/lib/job-queue";

export type AppEventType =
  | "knowledge_saved"
  | "knowledge_updated"
  | "task_created"
  | "task_updated"
  | "reminder_created"
  | "reminder_updated"
  | "document_processed"
  | "search_completed"
  | "expense_created"
  | "habit_logged"
  | "collection_updated"
  | "share_created"
  | "morning_run"
  | "meeting_processed"
  | "gmail_synced"
  | "inbox_item_created"
  | "inbox_triaged"
  | "project_updated"
  | "automation_ran";

const NOTIFY_EVENTS: Partial<Record<AppEventType, (payload: Record<string, unknown>) => { title: string; message: string; href?: string }>> = {
  knowledge_saved: (payload) => ({
    title: "Saved to vault",
    message: String(payload.title || "A knowledge item was added"),
    href: "/dashboard",
  }),
  task_created: (payload) => ({
    title: "Task created",
    message: String(payload.title || "A new task is ready"),
    href: "/dashboard/tasks",
  }),
  reminder_created: (payload) => ({
    title: "Reminder set",
    message: String(payload.text || "A reminder was scheduled"),
    href: "/dashboard/reminders",
  }),
  expense_created: (payload) => ({
    title: "Expense logged",
    message: `₹${payload.amount || 0} · ${payload.category || "general"}`,
    href: "/dashboard/expenses",
  }),
  habit_logged: (payload) => ({
    title: "Habit logged",
    message: String(payload.name || "Keep the streak going"),
    href: "/dashboard/habits",
  }),
  share_created: (payload) => ({
    title: "Share link created",
    message: String(payload.title || "A vault item is now shareable"),
    href: "/dashboard/developer",
  }),
  morning_run: () => ({
    title: "Morning OS ran",
    message: "Today's focus blocks are ready",
    href: "/dashboard/today",
  }),
  meeting_processed: (payload) => ({
    title: "Meeting processed",
    message: `${payload.title || "Meeting"} · ${payload.taskCount || 0} tasks created`,
    href: "/dashboard/meetings",
  }),
  gmail_synced: (payload) => ({
    title: "Gmail synced",
    message: `${payload.imported || 0} emails turned into vault items, bills, or reminders`,
    href: "/dashboard/integrations",
  }),
  inbox_item_created: (payload) => ({
    title: "New inbox item",
    message: String(payload.title || "Something needs your review"),
    href: "/dashboard/inbox",
  }),
};

export async function publishAppEvent(
  userId: string,
  type: AppEventType,
  payload: Record<string, unknown>
) {
  try {
    const event = await prisma.appEvent.create({
      data: { userId, type, payload },
    });
    const notify = NOTIFY_EVENTS[type];
    if (notify) {
      const content = notify(payload);
      await createNotification(userId, { ...content, type }).catch(() => {});
    }
    await enqueueJob(
      "webhooks.dispatch",
      { eventType: type, payload, eventId: event.id },
      {
        userId,
        idempotencyKey: `webhooks:${event.id}`,
        maxAttempts: 5,
      }
    ).catch(() => {});
    import("@/lib/automation-engine")
      .then(({ runAutomationsForEvent }) =>
        runAutomationsForEvent(userId, type, payload, event.id).catch(() => {})
      )
      .catch(() => {});
  } catch (error) {
    console.warn("[AppEvent] Failed to publish:", error);
  }
}

export async function getRecentAppEvents(userId: string, since?: Date) {
  return prisma.appEvent.findMany({
    where: {
      userId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}
