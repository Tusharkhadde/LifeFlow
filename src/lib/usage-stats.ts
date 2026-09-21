import { prisma } from "@/lib/db";
import { getMonthlyAiSpend } from "@/lib/ai-telemetry";

export const USAGE_LIMITS = {
  search: { max: 30, label: "AI Searches" },
  exa_search: { max: 20, label: "Exa Web Searches" },
  ai_chat: { max: 50, label: "AI Chat Messages" },
} as const;

export async function getUsageStats(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600000);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [usageCounts, vaultCount, expenseCount, habitCount, searchCount, aiSpend, aiByOperation, cacheHits, settings] = await Promise.all([
    prisma.usageLog.groupBy({
      by: ["action"],
      where: { userId, createdAt: { gte: since } },
      _count: { action: true },
    }),
    prisma.knowledgeItem.count({ where: { userId, archived: false } }),
    prisma.expense.count({ where: { userId, spentAt: { gte: since } } }),
    prisma.habit.count({ where: { userId, archived: false } }),
    prisma.searchHistory.count({ where: { userId, createdAt: { gte: since } } }),
    getMonthlyAiSpend(userId),
    prisma.aiUsageLog.groupBy({
      by: ["operation"],
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { id: true },
    }),
    prisma.aiUsageLog.count({ where: { userId, createdAt: { gte: monthStart }, cacheHit: true } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { monthlyAiBudgetUsd: true, preferredFastModel: true } }),
  ]);

  const countMap = Object.fromEntries(usageCounts.map((u) => [u.action, u._count.action]));

  const metrics = Object.entries(USAGE_LIMITS).map(([action, config]) => {
    const used = countMap[action] || 0;
    return {
      action,
      label: config.label,
      used,
      limit: config.max,
      percent: Math.min(100, Math.round((used / config.max) * 100)),
    };
  });

  return {
    period: "30 days",
    metrics,
    totals: {
      vaultItems: vaultCount,
      expensesThisMonth: expenseCount,
      activeHabits: habitCount,
      searchesThisMonth: searchCount,
    },
    ai: {
      month: aiSpend,
      budgetUsd: settings?.monthlyAiBudgetUsd || null,
      preferredFastModel: settings?.preferredFastModel || process.env.OPENAI_FAST_MODEL || null,
      cacheHits,
      byOperation: aiByOperation.map((row) => ({
        operation: row.operation,
        calls: row._count.id,
        costUsd: row._sum.costUsd || 0,
        inputTokens: row._sum.inputTokens || 0,
        outputTokens: row._sum.outputTokens || 0,
      })),
    },
  };
}
