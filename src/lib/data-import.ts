import { prisma } from "@/lib/db";
import { publishAppEvent } from "@/lib/events";

interface ImportPayload {
  knowledge?: Array<{ title?: string; summary?: string; aiMemory?: string; type?: string; sourceUrl?: string; category?: string; tags?: unknown; content?: string }>;
  tasks?: Array<{ title?: string; description?: string; dueAt?: string; completed?: boolean }>;
  reminders?: Array<{ text?: string; remindAt?: string; completed?: boolean }>;
  expenses?: Array<{ amount?: number; category?: string; merchant?: string; description?: string }>;
}

export async function importLifeFlowData(userId: string, payload: ImportPayload) {
  const imported = { knowledge: 0, tasks: 0, reminders: 0, expenses: 0 };

  for (const item of payload.knowledge || []) {
    if (!item.title?.trim()) continue;
    await prisma.knowledgeItem.create({
      data: {
        userId,
        title: item.title.trim(),
        summary: item.summary || null,
        aiMemory: item.aiMemory || null,
        type: item.type || "note",
        sourceUrl: item.sourceUrl || null,
        category: item.category || "Imported",
        tags: item.tags || ["imported"],
        content: item.content || null,
      },
    });
    imported.knowledge++;
  }

  for (const task of payload.tasks || []) {
    if (!task.title?.trim()) continue;
    await prisma.task.create({
      data: {
        userId,
        title: task.title.trim(),
        description: task.description || null,
        dueAt: task.dueAt ? new Date(task.dueAt) : null,
        completed: Boolean(task.completed),
      },
    });
    imported.tasks++;
  }

  for (const reminder of payload.reminders || []) {
    if (!reminder.text?.trim() || !reminder.remindAt) continue;
    await prisma.reminder.create({
      data: {
        userId,
        text: reminder.text.trim(),
        remindAt: new Date(reminder.remindAt),
        completed: Boolean(reminder.completed),
      },
    });
    imported.reminders++;
  }

  for (const expense of payload.expenses || []) {
    if (!expense.amount) continue;
    await prisma.expense.create({
      data: {
        userId,
        amount: Number(expense.amount),
        category: expense.category || "general",
        merchant: expense.merchant || null,
        description: expense.description || "Imported expense",
        source: "import",
      },
    });
    imported.expenses++;
  }

  await publishAppEvent(userId, "collection_updated", { imported });
  return imported;
}
