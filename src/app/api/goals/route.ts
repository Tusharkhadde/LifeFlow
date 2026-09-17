import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { name, targetAmount, deadline, addAmount, id } = await request.json();

    if (id && addAmount) {
      const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
      if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const updated = await prisma.savingsGoal.update({
        where: { id },
        data: { currentAmount: goal.currentAmount + Number(addAmount) },
      });
      return NextResponse.json({ goal: updated });
    }

    if (!name || !targetAmount) return NextResponse.json({ error: "Name and target required" }, { status: 400 });

    const goal = await prisma.savingsGoal.create({
      data: { userId, name, targetAmount: Number(targetAmount), deadline: deadline ? new Date(deadline) : null },
    });
    return NextResponse.json({ goal }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (id) await prisma.savingsGoal.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
