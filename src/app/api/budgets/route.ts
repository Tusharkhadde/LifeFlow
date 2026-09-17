import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getBudgetProgress, ensureUserSettings } from "@/lib/budgets-goals";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    return NextResponse.json(await getBudgetProgress(userId));
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { category, limitAmount, globalLimit } = await request.json();

    if (globalLimit !== undefined) {
      await ensureUserSettings(userId);
      await prisma.userSettings.update({ where: { userId }, data: { monthlyBudgetLimit: Number(globalLimit) } });
    }

    if (category && limitAmount) {
      await prisma.budget.upsert({
        where: { userId_category_period: { userId, category, period: "monthly" } },
        create: { userId, category, limitAmount: Number(limitAmount) },
        update: { limitAmount: Number(limitAmount) },
      });
    }

    return NextResponse.json(await getBudgetProgress(userId));
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (id) await prisma.budget.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
