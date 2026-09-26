import { prisma } from "@/lib/db";
import { getExpenseSummary } from "@/lib/expense-actions";
import { getHabitStats } from "@/lib/habit-actions";
import { getDailyInsightSummary } from "@/lib/productivity-actions";
import { getProactiveAlerts } from "@/lib/proactive-intelligence";

export async function generateWeeklyReview(userId: string): Promise<string> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [insights, expenses, habits, newItems, searches, alerts] = await Promise.all([
    getDailyInsightSummary(userId),
    getExpenseSummary(userId),
    getHabitStats(userId),
    prisma.knowledgeItem.count({ where: { userId, createdAt: { gte: weekAgo } } }),
    prisma.searchHistory.count({ where: { userId, createdAt: { gte: weekAgo } } }),
    getProactiveAlerts(userId),
  ]);

  const habitLines = habits
    .map((h) => `• ${h.name}: ${h.streak} day streak${h.loggedToday ? " ✅" : ""}`)
    .join("\n");

  const topCategories = (Object.entries(expenses.byCategory) as Array<[string, number]>)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, amt]) => `• ${cat}: ₹${Math.round(amt).toLocaleString("en-IN")}`)
    .join("\n");

  const lines = [
    "*📊 Your Weekly LifeFlow Review*",
    "",
    `*Knowledge:* ${newItems} new items saved, ${searches} searches performed`,
    `*Tasks:* ${insights.stats.activeTasks} active, ${insights.stats.overdueTasks} overdue`,
    `*Spending:* ₹${Math.round(expenses.total).toLocaleString("en-IN")} this month (${expenses.count} transactions)`,
    topCategories ? `\n*Top categories:*\n${topCategories}` : "",
    habitLines ? `\n*Habits:*\n${habitLines}` : "",
    alerts.length ? `\n*⚡ Alerts:*\n${alerts.slice(0, 3).map((a) => `• ${a.message}`).join("\n")}` : "",
    "",
    "*Focus for next week:*",
    ...insights.nextActions.slice(0, 2).map((a) => `• ${a}`),
  ];

  return lines.filter(Boolean).join("\n");
}
