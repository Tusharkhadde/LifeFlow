import { prisma } from "@/lib/db";
import { getDaysUntil } from "@/lib/utils";
import { getExpenseSummary } from "@/lib/expense-actions";

export interface ProactiveAlert {
  type: "expiry" | "overdue" | "reminder" | "budget" | "insight";
  severity: "high" | "medium" | "low";
  title: string;
  message: string;
  actionUrl?: string;
}

export async function getProactiveAlerts(userId: string): Promise<ProactiveAlert[]> {
  const now = new Date();
  const alerts: ProactiveAlert[] = [];

  const [documents, tasks, reminders, expenseSummary] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: { userId, archived: false, type: "document", expiryDate: { not: null } },
      orderBy: { expiryDate: "asc" },
      take: 20,
    }),
    prisma.task.findMany({ where: { userId, completed: false }, orderBy: { dueAt: "asc" }, take: 20 }),
    prisma.reminder.findMany({
      where: { userId, completed: false, remindAt: { gte: now } },
      orderBy: { remindAt: "asc" },
      take: 10,
    }),
    getExpenseSummary(userId),
  ]);

  for (const alert of expenseSummary.alerts) {
    alerts.push({
      type: "budget",
      severity: "medium",
      title: "Spending alert",
      message: alert,
      actionUrl: "/dashboard/expenses",
    });
  }

  for (const doc of documents) {
    if (!doc.expiryDate) continue;
    const days = getDaysUntil(doc.expiryDate);
    if (days < 0) {
      alerts.push({
        type: "expiry",
        severity: "high",
        title: `${doc.title} expired`,
        message: `${doc.documentType || "Document"} expired ${Math.abs(days)} days ago${doc.vendor ? ` (${doc.vendor})` : ""}.`,
        actionUrl: "/documents",
      });
    } else if (days <= 7) {
      alerts.push({
        type: "expiry",
        severity: days <= 3 ? "high" : "medium",
        title: `${doc.title} expiring soon`,
        message: `Expires in ${days} day${days === 1 ? "" : "s"}${doc.vendor ? ` from ${doc.vendor}` : ""}.`,
        actionUrl: "/documents",
      });
    }
  }

  for (const task of tasks) {
    if (!task.dueAt) continue;
    const days = getDaysUntil(task.dueAt);
    if (days < 0) {
      alerts.push({
        type: "overdue",
        severity: "high",
        title: "Overdue task",
        message: `"${task.title}" is ${Math.abs(days)} days overdue.`,
        actionUrl: "/tasks",
      });
    }
  }

  for (const reminder of reminders) {
    const hours = (reminder.remindAt.getTime() - now.getTime()) / 3600000;
    if (hours <= 24) {
      alerts.push({
        type: "reminder",
        severity: hours <= 6 ? "high" : "medium",
        title: "Upcoming reminder",
        message: `"${reminder.text}" in ${Math.max(1, Math.round(hours))} hours.`,
        actionUrl: "/reminders",
      });
    }
  }

  const amounts = documents.filter((d) => d.extractedAmount).map((d) => d.extractedAmount as number);
  if (amounts.length >= 3) {
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const latest = amounts[0];
    if (latest > avg * 1.5) {
      alerts.push({
        type: "budget",
        severity: "medium",
        title: "Unusual document amount",
        message: `Latest document amount (₹${latest.toLocaleString("en-IN")}) is above your average (₹${Math.round(avg).toLocaleString("en-IN")}).`,
        actionUrl: "/documents",
      });
    }
  }

  return alerts.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

export async function getEnhancedDailyBriefing(userId: string) {
  const [briefing, alerts] = await Promise.all([
    import("@/lib/productivity-actions").then((m) => m.getDailyBriefing(userId)),
    getProactiveAlerts(userId),
  ]);

  if (alerts.length === 0) return briefing;

  const alertSection = [
    "",
    "*⚡ Proactive alerts:*",
    ...alerts.slice(0, 5).map((a) => `• [${a.severity.toUpperCase()}] ${a.message}`),
  ].join("\n");

  return briefing + alertSection;
}
