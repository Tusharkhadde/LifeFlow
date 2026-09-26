import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { publishAppEvent } from "@/lib/events";
import { enqueueJob } from "@/lib/job-queue";
import { linkToProject } from "@/lib/projects";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const projectId = new URL(request.url).searchParams.get("projectId");
    const projectTaskIds = projectId
      ? (
          await prisma.projectLink.findMany({
            where: { userId, projectId, targetType: "task" },
            select: { targetId: true },
          })
        ).map((link) => link.targetId)
      : null;
    const items = await prisma.task.findMany({
      where: { userId, ...(projectTaskIds ? { id: { in: projectTaskIds } } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tasks: items });
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { title, description, dueAt, projectId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        userId,
        title: title.trim(),
        description: description?.trim() || null,
        dueAt: dueAt ? new Date(dueAt) : null,
      },
    });

    await publishAppEvent(userId, "task_created", { id: task.id, title: task.title });
    await Promise.all([
      enqueueJob(
        "calendar.sync",
        { type: "task", id: task.id },
        { userId, idempotencyKey: `calendar:task:${task.id}` }
      ),
      enqueueJob(
        "graph.auto_link",
        {
          text: `${task.title}. ${task.description || ""}`,
          source: `task:${task.id}`,
          hints: { subject: task.title, subjectType: "task", relation: "involves" },
        },
        { userId, idempotencyKey: `graph:task:${task.id}` }
      ),
    ]);
    if (projectId) await linkToProject(userId, projectId, "task", task.id);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { id, title, description, dueAt, completed } = body;

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await prisma.task.updateMany({
      where: { id, userId },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
        ...(completed !== undefined ? { completed } : {}),
      },
    });

    await publishAppEvent(userId, "task_updated", { id, completed });
    await enqueueJob(
      completed === true ? "calendar.remove" : "calendar.sync",
      { type: "task", id },
      { userId }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await enqueueJob("calendar.remove", { type: "task", id }, { userId });
    await prisma.task.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
