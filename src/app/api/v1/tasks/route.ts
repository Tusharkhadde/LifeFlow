import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { publishAppEvent } from "@/lib/events";
import { syncLifeFlowItemToIntegrations } from "@/lib/integrations/calendar-sync";
import { v1Error, v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "tasks:read");
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return v1Json({ tasks }, 200, request);
  } catch (error) {
    return v1Fail(error, request, "Failed to list tasks");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "tasks:write");
    const body = await request.json();
    if (!body.title?.trim()) return v1Error("title is required", 400, request);
    const task = await prisma.task.create({
      data: {
        userId,
        title: body.title.trim(),
        description: body.description || null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
    });
    await publishAppEvent(userId, "task_created", { id: task.id, title: task.title });
    void syncLifeFlowItemToIntegrations(userId, "task", task.id);
    return v1Json({ task }, 201, request);
  } catch (error) {
    return v1Fail(error, request, "Failed to create task");
  }
}
