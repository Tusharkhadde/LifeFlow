import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { createHabit, getHabitStats, logHabit } from "@/lib/habit-actions";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const habits = await getHabitStats(userId);
    return NextResponse.json({ habits });
  } catch {
    return NextResponse.json({ error: "Failed to fetch habits" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { name, description, action, habitName } = body;

    if (action === "log" && habitName) {
      const result = await logHabit(userId, habitName);
      if (!result) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
      return NextResponse.json(result);
    }

    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const habit = await createHabit(userId, name, description);
    return NextResponse.json({ habit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await prisma.habit.updateMany({ where: { id, userId }, data: { archived: true } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
