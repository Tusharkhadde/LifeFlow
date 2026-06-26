import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: [{ completed: "asc" }, { dueDate: "asc" }],
    });
    return NextResponse.json({ tasks });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { title, description, category, urgency, dueDate } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        userId,
        title,
        description: description || null,
        category: category || "general",
        urgency: urgency || "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
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
    if (updates.urgency !== undefined) data.urgency = updates.urgency;
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    if (updates.completed !== undefined) data.completed = updates.completed;
    if (updates.snoozedUntil !== undefined) data.snoozedUntil = updates.snoozedUntil ? new Date(updates.snoozedUntil) : null;

    const task = await prisma.task.update({
      where: { id },
      data,
    });

    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
