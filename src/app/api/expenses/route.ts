import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getExpenseSummary, createExpenseFromText } from "@/lib/expense-actions";
import { publishAppEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const summary = await getExpenseSummary(userId);
    const expenses = await prisma.expense.findMany({
      where: { userId },
      orderBy: { spentAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ expenses, summary });
  } catch {
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { text, amount, category, merchant, description } = body;

    if (text) {
      const expense = await createExpenseFromText(userId, text, "web");
      if (!expense) return NextResponse.json({ error: "Could not parse expense" }, { status: 400 });
      return NextResponse.json({ expense }, { status: 201 });
    }

    if (!amount) return NextResponse.json({ error: "Amount required" }, { status: 400 });

    const expense = await prisma.expense.create({
      data: {
        userId,
        amount: Number(amount),
        category: category || "general",
        merchant,
        description,
        source: "web",
      },
    });
    await publishAppEvent(userId, "expense_created", { id: expense.id, amount: expense.amount });
    return NextResponse.json({ expense }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await prisma.expense.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
