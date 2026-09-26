import { InboxStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publishAppEvent } from "@/lib/events";
import { enqueueJob } from "@/lib/job-queue";
import { linkToProject } from "@/lib/projects";

export interface InboxProposal {
  source: string;
  sourceRef?: string;
  kind: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  projectId?: string;
  forceReview?: boolean;
  alreadyMaterialized?: boolean;
}

export async function createInboxItem(userId: string, proposal: InboxProposal) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const review = proposal.forceReview || settings?.triageMode === "review";
  const status = proposal.alreadyMaterialized
    ? InboxStatus.ACCEPTED
    : review
      ? InboxStatus.PENDING
      : InboxStatus.ACCEPTED;
  const data = {
    userId,
    source: proposal.source,
    sourceRef: proposal.sourceRef,
    kind: proposal.kind,
    title: proposal.title.trim().slice(0, 200),
    summary: proposal.summary?.slice(0, 4000),
    payload: (proposal.payload || {}) as Prisma.InputJsonValue,
    priority: Math.max(0, Math.min(100, proposal.priority || 0)),
    projectId: proposal.projectId,
    status,
    ...(status === InboxStatus.ACCEPTED ? { triagedAt: new Date() } : {}),
  };

  const item = proposal.sourceRef
    ? await prisma.inboxItem.upsert({
        where: {
          userId_source_sourceRef: {
            userId,
            source: proposal.source,
            sourceRef: proposal.sourceRef,
          },
        },
        create: data,
        update: {
          title: data.title,
          summary: data.summary,
          payload: data.payload,
          priority: data.priority,
          projectId: data.projectId,
        },
      })
    : await prisma.inboxItem.create({ data });

  if (item.status === InboxStatus.PENDING) {
    await publishAppEvent(userId, "inbox_item_created", {
      id: item.id,
      title: item.title,
      kind: item.kind,
      projectId: item.projectId,
    });
  }
  return item;
}

export async function listInbox(
  userId: string,
  options: { status?: InboxStatus; source?: string; projectId?: string; limit?: number } = {}
) {
  const now = new Date();
  await prisma.inboxItem.updateMany({
    where: { userId, status: InboxStatus.SNOOZED, snoozedUntil: { lte: now } },
    data: { status: InboxStatus.PENDING, snoozedUntil: null },
  });
  return prisma.inboxItem.findMany({
    where: {
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.source ? { source: options.source } : {}),
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
    include: { project: { select: { id: true, name: true, color: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: Math.min(options.limit || 100, 200),
  });
}

async function materializeInboxItem(
  userId: string,
  item: Awaited<ReturnType<typeof prisma.inboxItem.findFirst>>
) {
  if (!item) throw new Error("Inbox item not found");
  const payload = (item.payload || {}) as Record<string, unknown>;
  let target: { type: string; id: string } | null = null;

  if (["action", "task"].includes(item.kind)) {
    const dueAt = payload.dueAt
      ? new Date(String(payload.dueAt))
      : typeof payload.dueInDays === "number"
        ? new Date(Date.now() + Number(payload.dueInDays) * 86400000)
        : null;
    const task = await prisma.task.create({
      data: {
        userId,
        title: String(payload.actionText || payload.title || item.title).slice(0, 160),
        description: String(payload.description || item.summary || `From ${item.source}`),
        dueAt,
      },
    });
    await publishAppEvent(userId, "task_created", { id: task.id, title: task.title, projectId: item.projectId });
    await enqueueJob("calendar.sync", { type: "task", id: task.id }, { userId });
    target = { type: "task", id: task.id };
  } else if (["reminder", "bill"].includes(item.kind)) {
    const remindAt = payload.remindAt
      ? new Date(String(payload.remindAt))
      : new Date(Date.now() + Number(payload.dueInDays || 1) * 86400000);
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        text: String(payload.text || payload.title || item.title).slice(0, 200),
        remindAt,
      },
    });
    await publishAppEvent(userId, "reminder_created", {
      id: reminder.id,
      text: reminder.text,
      projectId: item.projectId,
    });
    await enqueueJob("calendar.sync", { type: "reminder", id: reminder.id }, { userId });
    if (item.kind === "bill" && Number(payload.amount) > 0) {
      await prisma.recurringBill.create({
        data: {
          userId,
          name: String(payload.merchant || item.title).slice(0, 120),
          amount: Number(payload.amount),
          category: "bills",
          merchant: payload.merchant ? String(payload.merchant) : undefined,
          nextDueAt: remindAt,
        },
      });
    }
    target = { type: "reminder", id: reminder.id };
  } else if (item.kind === "knowledge") {
    const input = String(payload.input || payload.url || payload.content || item.summary || item.title);
    const { processAndSynthesizeInput } = await import("@/lib/knowledge-engine");
    const processed = await processAndSynthesizeInput(input);
    const knowledge = await prisma.knowledgeItem.create({
      data: {
        userId,
        title: processed.title,
        summary: processed.summary,
        aiMemory: processed.aiMemory,
        content: processed.content || null,
        type: processed.type,
        sourceUrl: processed.sourceUrl || null,
        favicon: processed.favicon || null,
        category: processed.category,
        tags: processed.tags,
      },
    });
    await publishAppEvent(userId, "knowledge_saved", {
      id: knowledge.id,
      title: knowledge.title,
      projectId: item.projectId,
    });
    await Promise.all([
      enqueueJob("embedding.index", { itemId: knowledge.id }, { userId, idempotencyKey: `embedding:${knowledge.id}` }),
      enqueueJob(
        "graph.auto_link",
        { text: `${knowledge.title}. ${knowledge.summary || ""}`, source: `knowledge:${knowledge.id}` },
        { userId, idempotencyKey: `graph:knowledge:${knowledge.id}` }
      ),
    ]);
    target = { type: "knowledge", id: knowledge.id };
  } else if (item.kind === "expense") {
    const { createExpenseFromParsed } = await import("@/lib/expense-actions");
    const expense = await createExpenseFromParsed(
      userId,
      {
        amount: Number(payload.amount),
        category: String(payload.category || "general"),
        merchant: payload.merchant ? String(payload.merchant) : undefined,
        description: String(payload.description || item.title),
      },
      item.source
    );
    target = { type: "expense", id: expense.id };
  } else if (item.kind === "memory") {
    const { rememberPersonalFact } = await import("@/lib/personal-memory");
    const memory = await rememberPersonalFact(
      userId,
      String(payload.key || item.title).toLowerCase(),
      String(payload.value || item.summary || ""),
      `inbox:${item.id}`
    );
    target = { type: "memory", id: memory.id };
  }

  if (target && item.projectId) {
    await linkToProject(userId, item.projectId, target.type, target.id);
  }
  return target;
}

export async function acceptInboxItem(userId: string, id: string, projectId?: string) {
  const item = await prisma.inboxItem.findFirst({
    where: { id, userId, status: { in: [InboxStatus.PENDING, InboxStatus.SNOOZED] } },
  });
  if (!item) throw new Error("Pending inbox item not found");
  if (projectId) {
    await prisma.inboxItem.update({ where: { id }, data: { projectId } });
    item.projectId = projectId;
  }
  const claimed = await prisma.inboxItem.updateMany({
    where: { id, userId, status: { in: [InboxStatus.PENDING, InboxStatus.SNOOZED] } },
    data: { status: InboxStatus.ACCEPTED, triagedAt: new Date(), snoozedUntil: null },
  });
  if (!claimed.count) throw new Error("Inbox item was already triaged");
  try {
    const target = await materializeInboxItem(userId, item);
    await prisma.inboxItem.update({
      where: { id },
      data: {
        payload: {
          ...(item.payload as Record<string, unknown>),
          materialized: target,
        } as Prisma.InputJsonValue,
      },
    });
    await publishAppEvent(userId, "inbox_triaged", {
      id,
      action: "accepted",
      target,
      projectId: item.projectId,
    });
    return target;
  } catch (error) {
    await prisma.inboxItem.update({
      where: { id },
      data: { status: InboxStatus.PENDING, triagedAt: null },
    });
    throw error;
  }
}

export async function dismissInboxItem(userId: string, id: string) {
  const result = await prisma.inboxItem.updateMany({
    where: { id, userId, status: { in: [InboxStatus.PENDING, InboxStatus.SNOOZED] } },
    data: { status: InboxStatus.DISMISSED, triagedAt: new Date(), snoozedUntil: null },
  });
  if (result.count) {
    await publishAppEvent(userId, "inbox_triaged", { id, action: "dismissed" });
  }
  return result;
}

export async function snoozeInboxItem(userId: string, id: string, until: Date) {
  if (until <= new Date()) throw new Error("Snooze time must be in the future");
  return prisma.inboxItem.updateMany({
    where: { id, userId, status: InboxStatus.PENDING },
    data: { status: InboxStatus.SNOOZED, snoozedUntil: until },
  });
}

export async function bulkTriage(
  userId: string,
  ids: string[],
  action: "accept" | "dismiss",
  projectId?: string
) {
  const results = [];
  for (const id of ids.slice(0, 50)) {
    try {
      if (action === "accept") results.push({ id, ok: true, target: await acceptInboxItem(userId, id, projectId) });
      else {
        await dismissInboxItem(userId, id);
        results.push({ id, ok: true });
      }
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : "Failed" });
    }
  }
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, lastTriageAt: new Date() },
    update: { lastTriageAt: new Date() },
  });
  return results;
}

export async function getInboxSummary(userId: string) {
  const [pending, snoozed, acceptedToday] = await Promise.all([
    prisma.inboxItem.count({ where: { userId, status: InboxStatus.PENDING } }),
    prisma.inboxItem.count({ where: { userId, status: InboxStatus.SNOOZED } }),
    prisma.inboxItem.count({
      where: {
        userId,
        status: InboxStatus.ACCEPTED,
        triagedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);
  return { pending, snoozed, acceptedToday };
}
