import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { publishAppEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const items = await prisma.reminder.findMany({
      where: { userId },
      orderBy: { remindAt: "asc" },
    });
    return NextResponse.json({ reminders: items });
  } catch (error) {
    console.error("GET /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { text, remindAt } = body;

    if (!text?.trim() || !remindAt) {
      return NextResponse.json({ error: "Text and remindAt are required" }, { status: 400 });
    }

    const reminder = await prisma.reminder.create({
      data: { userId, text: text.trim(), remindAt: new Date(remindAt) },
    });

    await publishAppEvent(userId, "reminder_created", { id: reminder.id, text: reminder.text });
    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { id, text, remindAt, completed } = body;

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await prisma.reminder.updateMany({
      where: { id, userId },
      data: {
        ...(text !== undefined ? { text: text.trim() } : {}),
        ...(remindAt !== undefined ? { remindAt: new Date(remindAt) } : {}),
        ...(completed !== undefined ? { completed } : {}),
      },
    });

    await publishAppEvent(userId, "reminder_updated", { id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await prisma.reminder.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}
