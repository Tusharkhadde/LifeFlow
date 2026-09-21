import { prisma } from "@/lib/db";

export async function getBudgetProgress(userId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [budgets, expenses, goals, settings] = await Promise.all([
    prisma.budget.findMany({ where: { userId } }),
    prisma.expense.findMany({ where: { userId, spentAt: { gte: monthStart } } }),
    prisma.savingsGoal.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);

  const spentByCategory: Record<string, number> = {};
  for (const e of expenses) {
    spentByCategory[e.category] = (spentByCategory[e.category] || 0) + e.amount;
  }

  const budgetProgress = budgets.map((b) => {
    const spent = spentByCategory[b.category] || 0;
    return {
      ...b,
      spent,
      remaining: b.limitAmount - spent,
      percent: Math.min(100, Math.round((spent / b.limitAmount) * 100)),
      overBudget: spent > b.limitAmount,
    };
  });

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const globalLimit = settings?.monthlyBudgetLimit;

  return {
    budgets: budgetProgress,
    goals: goals.map((g) => ({
      ...g,
      percent: Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)),
    })),
    totalSpent,
    globalLimit,
    globalPercent: globalLimit ? Math.min(100, Math.round((totalSpent / globalLimit) * 100)) : null,
  };
}

export async function ensureUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}
