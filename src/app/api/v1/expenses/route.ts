import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createExpenseFromParsed, createExpenseFromText, getExpenseSummary } from "@/lib/expense-actions";
import { v1Error, v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "expenses:read");
    const [expenses, summary] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { spentAt: "desc" }, take: 50 }),
      getExpenseSummary(userId),
    ]);
    return v1Json({ expenses, summary }, 200, request);
  } catch (error) {
    return v1Fail(error, request, "Failed to list expenses");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "expenses:write");
    const body = await request.json();
    if (body.text) {
      const expense = await createExpenseFromText(userId, body.text, "api");
      if (!expense) return v1Error("Could not parse expense text", 400, request);
      return v1Json({ expense }, 201, request);
    }
    if (!body.amount) return v1Error("amount or text is required", 400, request);
    const expense = await createExpenseFromParsed(
      userId,
      {
        amount: Number(body.amount),
        category: body.category || "general",
        merchant: body.merchant,
        description: body.description || "API expense",
      },
      "api"
    );
    return v1Json({ expense }, 201, request);
  } catch (error) {
    return v1Fail(error, request, "Failed to create expense");
  }
}
