export interface ParsedExpense {
  amount: number;
  category: string;
  merchant?: string;
  description: string;
}

const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  food: /lunch|dinner|breakfast|food|restaurant|cafe|coffee|swiggy|zomato|grocer/i,
  transport: /uber|ola|petrol|diesel|fuel|metro|bus|taxi|cab|transport/i,
  utilities: /electricity|water|gas|internet|wifi|broadband|recharge|mobile bill/i,
  shopping: /amazon|flipkart|shopping|clothes|shoes|mall/i,
  health: /medicine|pharmacy|doctor|hospital|gym|health/i,
  entertainment: /movie|netflix|spotify|game|concert/i,
  bills: /bill|rent|emi|subscription|insurance/i,
};

export function parseExpenseFromText(text: string): ParsedExpense | null {
  const trimmed = text.trim();
  const amountMatch = trimmed.match(/(?:₹|rs\.?|inr\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:₹|rs|inr)?/i);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(",", ""));
  if (!amount || amount <= 0) return null;

  const spendPatterns = [
    /(?:spent|paid|pay|bought|purchase[d]?|cost(?:s|ed)?)\s+(?:₹|rs\.?|inr\s*)?\d+(?:[.,]\d{1,2})?\s*(?:₹|rs|inr)?\s*(?:on|for|at)\s+(.+)/i,
    /(?:₹|rs\.?|inr\s*)?\d+(?:[.,]\d{1,2})?\s*(?:₹|rs|inr)?\s+(?:on|for|at)\s+(.+)/i,
    /(.+?)\s+(?:₹|rs\.?|inr\s*)?\d+/i,
  ];

  let description = trimmed;
  let merchant: string | undefined;

  for (const pattern of spendPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      description = match[1].trim().replace(/[.!]+$/, "");
      merchant = description.split(/\s+/).slice(0, 3).join(" ");
      break;
    }
  }

  let category = "general";
  for (const [cat, regex] of Object.entries(CATEGORY_KEYWORDS)) {
    if (regex.test(trimmed)) {
      category = cat;
      break;
    }
  }

  const hasSpendIntent = /spent|paid|pay|bought|purchase|cost|expense|₹|rs\.?\s*\d/i.test(trimmed);
  if (!hasSpendIntent) return null;

  return { amount, category, merchant, description: trimmed };
}

export function getExpenseBudgetAlerts(
  expenses: Array<{ amount: number; category: string; spentAt: Date }>,
  monthlyBudget = 50000
): string[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = expenses.filter((e) => e.spentAt >= monthStart);
  const total = thisMonth.reduce((sum, e) => sum + e.amount, 0);

  const alerts: string[] = [];
  if (total > monthlyBudget * 0.8) {
    alerts.push(`You've spent ₹${Math.round(total).toLocaleString("en-IN")} this month (${Math.round((total / monthlyBudget) * 100)}% of budget).`);
  }

  const byCategory: Record<string, number> = {};
  for (const e of thisMonth) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }

  const avgByCat: Record<string, number> = {};
  const prevMonth = expenses.filter((e) => {
    const d = e.spentAt;
    return d.getMonth() === now.getMonth() - 1 || (now.getMonth() === 0 && d.getMonth() === 11);
  });
  for (const e of prevMonth) {
    avgByCat[e.category] = (avgByCat[e.category] || 0) + e.amount;
  }

  for (const [cat, amount] of Object.entries(byCategory)) {
    const prev = avgByCat[cat];
    if (prev && amount > prev * 1.4) {
      alerts.push(`${cat} spending (₹${Math.round(amount).toLocaleString("en-IN")}) is 40%+ above last month.`);
    }
  }

  return alerts;
}
