import { prisma } from "@/lib/db";
import { getDailyInsightSummary } from "@/lib/productivity-actions";
import { getProactiveAlerts } from "@/lib/proactive-intelligence";
import { getExpenseSummary } from "@/lib/expense-actions";
import { getHabitStats } from "@/lib/habit-actions";
import { listIntegrations } from "@/lib/integrations/store";
import { unreadNotificationCount } from "@/lib/notifications";
import { getInboxSummary } from "@/lib/inbox-actions";

export async function getCommandCenter(userId: string) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    insights,
    alerts,
    expenseSummary,
    habits,
    integrations,
    unread,
    tasks,
    reminders,
    recentKnowledge,
    recentEvents,
    telegramLink,
    searchCount,
    inbox,
  ] = await Promise.all([
    getDailyInsightSummary(userId),
    getProactiveAlerts(userId),
    getExpenseSummary(userId),
    getHabitStats(userId),
    listIntegrations(userId),
    unreadNotificationCount(userId),
    prisma.task.findMany({
      where: { userId, completed: false },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    prisma.reminder.findMany({
      where: { userId, completed: false, remindAt: { lte: tomorrow } },
      orderBy: { remindAt: "asc" },
      take: 8,
    }),
    prisma.knowledgeItem.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, aiMemory: true, type: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.telegramLink.findFirst({ where: { userId } }),
    prisma.searchHistory.count({ where: { userId } }),
    getInboxSummary(userId),
  ]);

  const overdueTasks = tasks.filter((task) => task.dueAt && task.dueAt < now);
  const dueToday = tasks.filter((task) => {
    if (!task.dueAt) return false;
    return task.dueAt >= todayStart && task.dueAt < tomorrow;
  });

  const onboarding = [
    { key: "vault", label: "Save your first knowledge item", done: insights.stats.savedKnowledge > 0, href: "/dashboard" },
    { key: "task", label: "Create a task", done: insights.stats.activeTasks > 0 || overdueTasks.length > 0, href: "/dashboard/tasks" },
    { key: "telegram", label: "Link Telegram", done: Boolean(telegramLink), href: "/settings" },
    { key: "search", label: "Ask your AI brain", done: searchCount > 0, href: "/assistant" },
    { key: "integration", label: "Connect Calendar or Notion", done: integrations.length > 0, href: "/dashboard/integrations" },
  ];

  return {
    generatedAt: now.toISOString(),
    insights,
    alerts,
    unreadNotifications: unread,
    inbox,
    expenses: {
      total: expenseSummary.total,
      alerts: expenseSummary.alerts || [],
    },
    habits: habits.slice(0, 5),
    tasks: {
      overdue: overdueTasks,
      dueToday,
      upcoming: tasks,
    },
    reminders,
    recentKnowledge,
    activity: recentEvents,
    integrations: integrations.map((item) => item.provider),
    onboarding: {
      items: onboarding,
      completed: onboarding.filter((item) => item.done).length,
      total: onboarding.length,
    },
  };
}
