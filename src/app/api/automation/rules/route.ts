import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import {
  AUTOMATION_TEMPLATES,
  runAutomationRule,
} from "@/lib/automation-engine";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const rules = await prisma.automationRule.findMany({
      where: { userId },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 5 } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ rules, templates: AUTOMATION_TEMPLATES });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const template = body.templateId
      ? AUTOMATION_TEMPLATES.find((candidate) => candidate.id === body.templateId)
      : null;
    const input = template || body;
    if (!input.name || !input.trigger || !Array.isArray(input.actions)) {
      return NextResponse.json({ error: "name, trigger, and actions are required" }, { status: 400 });
    }
    const count = await prisma.automationRule.count({ where: { userId } });
    if (count >= 30) return NextResponse.json({ error: "Maximum 30 automation rules" }, { status: 429 });
    const rule = await prisma.automationRule.create({
      data: {
        userId,
        name: String(input.name).slice(0, 120),
        description: input.description ? String(input.description).slice(0, 500) : null,
        trigger: input.trigger as Prisma.InputJsonValue,
        conditions: (input.conditions || []) as Prisma.InputJsonValue,
        actions: input.actions as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const existing = await prisma.automationRule.findFirst({ where: { id: body.id, userId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.action === "test") {
      const result = await runAutomationRule(
        existing.id,
        userId,
        body.input || { event: "manual", payload: {} },
        `manual:${crypto.randomUUID()}`
      );
      return NextResponse.json({ result });
    }
    const rule = await prisma.automationRule.update({
      where: { id: existing.id },
      data: {
        ...(body.name ? { name: String(body.name).slice(0, 120) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
        ...(body.trigger ? { trigger: body.trigger as Prisma.InputJsonValue } : {}),
        ...(body.conditions ? { conditions: body.conditions as Prisma.InputJsonValue } : {}),
        ...(body.actions ? { actions: body.actions as Prisma.InputJsonValue } : {}),
      },
    });
    return NextResponse.json({ rule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.automationRule.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
