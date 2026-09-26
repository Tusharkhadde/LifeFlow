import { prisma } from "@/lib/db";
import { parseExpenseFromText, getExpenseBudgetAlerts } from "@/lib/expense-parser";
import { publishAppEvent } from "@/lib/events";
import { enqueueJob } from "@/lib/job-queue";

export async function createExpenseFromParsed(
  userId: string,
  parsed: { amount: number; category: string; merchant?: string; description: string },
  source = "telegram"
) {
  const expense = await prisma.expense.create({
    data: {
      userId,
      amount: parsed.amount,
      category: parsed.category,
      merchant: parsed.merchant,
      description: parsed.description,
      source,
    },
  });
  await publishAppEvent(userId, "expense_created", { id: expense.id, amount: expense.amount, category: expense.category });
  await enqueueJob(
    "bills.detect",
    {},
    { userId, idempotencyKey: `bills:${userId}:${new Date().toISOString().slice(0, 10)}` }
  );
  if (expense.merchant) {
    await enqueueJob(
      "graph.auto_link",
      {
        text: `${expense.merchant} is a ${expense.category} merchant. ${expense.description || ""}`,
        source: `expense:${expense.id}`,
        hints: {
          subject: expense.merchant,
          subjectType: "merchant",
          relation: "belongs_to",
        },
      },
      { userId, idempotencyKey: `graph:expense:${expense.id}` }
    );
  }
  return expense;
}

export async function createExpenseFromText(userId: string, text: string, source = "telegram") {
  const parsed = parseExpenseFromText(text);
  if (!parsed) return null;
  return createExpenseFromParsed(userId, parsed, source);
}

export async function getExpenseSummary(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const expenses = await prisma.expense.findMany({
    where: { userId },
    orderBy: { spentAt: "desc" },
    take: 200,
  });

  const thisMonth = expenses.filter((e) => e.spentAt >= monthStart);
  const total = thisMonth.reduce((sum, e) => sum + e.amount, 0);

  const byCategory: Record<string, number> = {};
  for (const e of thisMonth) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }

  const alerts = getExpenseBudgetAlerts(expenses);

  return { total, count: thisMonth.length, byCategory, recent: thisMonth.slice(0, 10), alerts };
}

export { parseExpenseFromText };
