import { prisma } from "@/lib/db";

export async function detectRecurringBills(userId: string) {
  const expenses = await prisma.expense.findMany({
    where: { userId },
    orderBy: { spentAt: "desc" },
    take: 200,
  });

  const groups: Record<string, typeof expenses> = {};
  for (const e of expenses) {
    const key = `${(e.merchant || e.category).toLowerCase()}-${Math.round(e.amount / 100) * 100}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }

  const detected = [];
  for (const [, items] of Object.entries(groups)) {
    if (items.length < 2) continue;
    const avgAmount = items.reduce((s, i) => s + i.amount, 0) / items.length;
    const name = items[0].merchant || items[0].category;
    const category = items[0].category;

    const nextDue = new Date(items[0].spentAt);
    nextDue.setMonth(nextDue.getMonth() + 1);

    const existing = await prisma.recurringBill.findFirst({ where: { userId, name } });
    const bill = existing
      ? await prisma.recurringBill.update({
          where: { id: existing.id },
          data: { amount: avgAmount, nextDueAt: nextDue },
        })
      : await prisma.recurringBill.create({
          data: { userId, name, amount: avgAmount, category, merchant: items[0].merchant, frequency: "monthly", nextDueAt: nextDue },
        });

    detected.push(bill);
  }

  return detected;
}

export async function getUpcomingBills(userId: string) {
  const now = new Date();
  const twoWeeks = new Date(now);
  twoWeeks.setDate(twoWeeks.getDate() + 14);

  return prisma.recurringBill.findMany({
    where: { userId, active: true, nextDueAt: { lte: twoWeeks } },
    orderBy: { nextDueAt: "asc" },
  });
}
