import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const reminders = await prisma.reminder.findMany({
      where: { userId },
      orderBy: { datetime: "asc" },
    });
    return NextResponse.json({ reminders });
  } catch {
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const { title, description, datetime, recurrence, category } = body;

    if (!title || !datetime) {
      return NextResponse.json({ error: "Title and datetime are required" }, { status: 400 });
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title,
        description: description || null,
        datetime: new Date(datetime),
        recurrence: recurrence || null,
        category: category || "general",
      },
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
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
    if (updates.datetime !== undefined) data.datetime = new Date(updates.datetime);
    if (updates.recurrence !== undefined) data.recurrence = updates.recurrence;
    if (updates.category !== undefined) data.category = updates.category;
    if (updates.completed !== undefined) data.completed = updates.completed;
    if (updates.snoozedUntil !== undefined) data.snoozedUntil = updates.snoozedUntil ? new Date(updates.snoozedUntil) : null;

    const reminder = await prisma.reminder.update({
      where: { id },
      data,
    });

    return NextResponse.json({ reminder });
  } catch {
    return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}
