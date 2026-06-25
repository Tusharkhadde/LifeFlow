import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ goals });
  } catch {
    return NextResponse.json({ error: "Failed to fetch goals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const { title, description, category, target, current, unit, deadline } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const goal = await prisma.goal.create({
      data: {
        userId,
        title,
        description: description || null,
        category: category || "personal",
        target: target ? parseFloat(target) : null,
        current: current ? parseFloat(current) : 0,
        unit: unit || null,
        deadline: deadline ? new Date(deadline) : null,
      },
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.category !== undefined) data.category = updates.category;
    if (updates.target !== undefined) data.target = updates.target ? parseFloat(updates.target) : null;
    if (updates.current !== undefined) data.current = parseFloat(updates.current);
    if (updates.unit !== undefined) data.unit = updates.unit;
    if (updates.deadline !== undefined) data.deadline = updates.deadline ? new Date(updates.deadline) : null;
    if (updates.completed !== undefined) data.completed = updates.completed;

    const goal = await prisma.goal.update({
      where: { id },
      data,
    });

    return NextResponse.json({ goal });
  } catch {
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }
}
