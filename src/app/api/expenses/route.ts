import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const expenses = await prisma.expense.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });
    return NextResponse.json({ expenses });
  } catch {
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { amount, category, description, date, source } = body;

    if (!amount || !category) {
      return NextResponse.json({ error: "Amount and category are required" }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        userId,
        amount: parseFloat(amount),
        category,
        description: description || null,
        date: date ? new Date(date) : new Date(),
        source: source || "manual",
      },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
