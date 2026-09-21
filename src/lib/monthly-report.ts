import { generateWeeklyReview } from "@/lib/weekly-review";
import { getBudgetProgress } from "@/lib/budgets-goals";
import { getUsageStats } from "@/lib/usage-stats";
import { getUpcomingBills } from "@/lib/bill-autopilot";
import { prisma } from "@/lib/db";

export async function generateMonthlyReport(userId: string): Promise<string> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [weekly, budget, usage, bills, topKnowledge] = await Promise.all([
    generateWeeklyReview(userId),
    getBudgetProgress(userId),
    getUsageStats(userId),
    getUpcomingBills(userId),
    prisma.knowledgeItem.findMany({
      where: { userId, createdAt: { gte: monthStart } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const lines = [
    "# LifeFlow Monthly Report",
    `Generated: ${new Date().toLocaleDateString("en-IN")}`,
    "",
    "## Executive Summary",
    weekly.split("\n").slice(0, 8).join("\n"),
    "",
    "## Financial Overview",
    `- Total spent this month: ₹${Math.round(budget.totalSpent).toLocaleString("en-IN")}`,
    budget.globalLimit ? `- Budget limit: ₹${budget.globalLimit.toLocaleString("en-IN")} (${budget.globalPercent}%)` : "",
    "",
    "### Budget by Category",
    ...budget.budgets.map((b) => `- ${b.category}: ₹${Math.round(b.spent)}/${b.limitAmount} (${b.percent}%)${b.overBudget ? " ⚠️ OVER" : ""}`),
    "",
    "### Savings Goals",
    ...(budget.goals.length
      ? budget.goals.map((g) => `- ${g.name}: ₹${g.currentAmount}/${g.targetAmount} (${g.percent}%)`)
      : ["- No active goals"]),
    "",
    "## Upcoming Bills",
    ...(bills.length ? bills.map((b) => `- ${b.name}: ₹${Math.round(b.amount)} due ${b.nextDueAt?.toLocaleDateString() || "TBD"}`) : ["- None detected"]),
    "",
    "## Usage Stats",
    ...usage.metrics.map((m) => `- ${m.label}: ${m.used}/${m.limit}`),
    `- Vault items: ${usage.totals.vaultItems}`,
    "",
    "## Top Saves This Month",
    ...topKnowledge.map((k) => `- ${k.title}${k.sourceUrl ? ` (${k.sourceUrl})` : ""}`),
  ];

  return lines.filter(Boolean).join("\n");
}
