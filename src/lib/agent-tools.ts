import { z } from "zod";
import { prisma } from "@/lib/db";
import { processAndSynthesizeInput, indexKnowledgeItemEmbedding } from "@/lib/knowledge-engine";
import { executeSmartSearch } from "@/lib/search-pipeline";
import { publishAppEvent } from "@/lib/events";
import { createExpenseFromText } from "@/lib/expense-actions";
import { logHabit, createHabit } from "@/lib/habit-actions";

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// Tool 1: saveKnowledgeItem
export const saveKnowledgeItemSchema = z.object({
  input: z.string().min(1, "Input text or URL is required"),
});

export async function executeSaveKnowledgeItem(
  userId: string,
  rawArgs: unknown
): Promise<ToolResult> {
  try {
    const parseResult = saveKnowledgeItemSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return { success: false, message: "Please provide a valid web link or note text." };
    }

    const { input } = parseResult.data;
    const processed = await processAndSynthesizeInput(input);

    const item = await prisma.knowledgeItem.create({
      data: {
        userId,
        title: processed.title,
        summary: processed.summary,
        aiMemory: processed.aiMemory,
        type: processed.type,
        category: processed.category,
        tags: processed.tags,
        sourceUrl: processed.sourceUrl || null,
        favicon: processed.favicon || null,
        content: processed.content || null,
      },
    });
    await indexKnowledgeItemEmbedding(item.id);
    await publishAppEvent(userId, "knowledge_saved", { id: item.id, title: item.title });

    const tagsStr = (Array.isArray(item.tags) ? item.tags : []).join(", ");
    const reply = `✅ Saved to AI Second Brain!\n📌 *${item.title}*\n💡 _${item.aiMemory || item.summary}_\n🏷️ Tags: \`${tagsStr}\``;

    return { success: true, message: reply, data: item };
  } catch (error) {
    console.error("[Tool: saveKnowledgeItem Error]", error);
    return { success: false, message: "Failed to save knowledge item." };
  }
}

// Tool 2: searchKnowledgeVault
export const searchKnowledgeVaultSchema = z.object({
  query: z.string().min(1, "Query is required"),
});

export async function executeSearchKnowledgeVault(
  userId: string,
  rawArgs: unknown
): Promise<ToolResult> {
  try {
    const parseResult = searchKnowledgeVaultSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return { success: false, message: "Please specify what you want to search." };
    }

    const { query } = parseResult.data;
    const result = await executeSmartSearch(userId, query, "", { useExa: true, storeMemory: true });

    return { success: true, message: result.reply, data: { matchingItems: result.matchingItems, exaResults: result.exaResults } };
  } catch (error) {
    console.error("[Tool: searchKnowledgeVault Error]", error);
    return { success: false, message: "Failed to search knowledge vault." };
  }
}

export async function executeLogExpense(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { text?: string };
  if (!args.text) return { success: false, message: "Expense text required." };
  const expense = await createExpenseFromText(userId, args.text, "agent");
  if (!expense) return { success: false, message: "Could not parse expense." };
  return { success: true, message: `Logged ₹${expense.amount} (${expense.category})`, data: expense };
}

export async function executeLogHabit(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { name?: string; create?: boolean };
  if (!args.name) return { success: false, message: "Habit name required." };
  if (args.create) {
    await createHabit(userId, args.name);
    return { success: true, message: `Habit "${args.name}" created.` };
  }
  const result = await logHabit(userId, args.name);
  if (!result) return { success: false, message: `Habit "${args.name}" not found.` };
  return { success: true, message: `Logged ${result.habit.name}! Streak continues.` };
}

export async function executeCreateTask(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { title?: string; due?: string };
  if (!args.title?.trim()) return { success: false, message: "Task title required." };
  const { createTask } = await import("@/lib/productivity-actions");
  try {
    const task = await createTask(userId, args.title, args.due);
    await publishAppEvent(userId, "task_created", { id: task.id, title: task.title });
    return {
      success: true,
      message: `Task created: ${task.title}${task.dueAt ? ` (due ${task.dueAt.toLocaleString()})` : ""}`,
      data: task,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Could not create task." };
  }
}

export async function executeCreateReminder(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { text?: string; when?: string };
  if (!args.text?.trim() || !args.when?.trim()) return { success: false, message: "Reminder text and time required." };
  const { createReminder } = await import("@/lib/productivity-actions");
  try {
    const reminder = await createReminder(userId, args.text, args.when);
    await publishAppEvent(userId, "reminder_created", { id: reminder.id, text: reminder.text });
    return { success: true, message: `Reminder set for ${reminder.remindAt.toLocaleString()}: ${reminder.text}`, data: reminder };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Could not create reminder." };
  }
}

export async function executeListTasks(userId: string): Promise<ToolResult> {
  const tasks = await prisma.task.findMany({
    where: { userId, completed: false },
    orderBy: { dueAt: "asc" },
    take: 15,
  });
  return {
    success: true,
    message: tasks.length
      ? tasks.map((task) => `- ${task.title}${task.dueAt ? ` (due ${task.dueAt.toLocaleDateString()})` : ""}`).join("\n")
      : "No open tasks.",
    data: tasks,
  };
}

export async function executeCompleteTask(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { title?: string };
  if (!args.title?.trim()) return { success: false, message: "Task title required." };
  const task = await prisma.task.findFirst({
    where: { userId, completed: false, title: { contains: args.title, mode: "insensitive" } },
  });
  if (!task) return { success: false, message: `No open task matching "${args.title}".` };
  await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
  await publishAppEvent(userId, "task_updated", { id: task.id, completed: true });
  return { success: true, message: `Completed: ${task.title}`, data: task };
}

export async function executeGetOverview(userId: string): Promise<ToolResult> {
  const { getCommandCenter } = await import("@/lib/command-center");
  const overview = await getCommandCenter(userId);
  const lines = [
    overview.insights.summary,
    `Focus score ${overview.insights.productivityScore}/100. Month spend ₹${Math.round(overview.expenses.total)}.`,
    overview.tasks.overdue.length ? `Overdue: ${overview.tasks.overdue.map((task) => task.title).join(", ")}` : "No overdue tasks.",
    overview.alerts.length ? `Alerts: ${overview.alerts.slice(0, 3).map((alert) => alert.message).join(" | ")}` : "",
  ].filter(Boolean);
  return { success: true, message: lines.join("\n"), data: overview };
}

export async function executeRunMorning(userId: string): Promise<ToolResult> {
  const { runMorningAgent } = await import("@/lib/morning-agent");
  const run = await runMorningAgent(userId, { notifyTelegram: false });
  return { success: true, message: run.telegram, data: run };
}

export async function executeProcessMeeting(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { transcript?: string; title?: string };
  if (!args.transcript || args.transcript.trim().length < 20) return { success: false, message: "Transcript too short." };
  const { processMeetingTranscript, formatMeetingForTelegram } = await import("@/lib/meeting-intelligence");
  try {
    const result = await processMeetingTranscript(userId, args.transcript, { title: args.title, source: "assistant" });
    return { success: true, message: formatMeetingForTelegram(result), data: result };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Meeting processing failed." };
  }
}

export async function executeRememberFact(userId: string, rawArgs: unknown): Promise<ToolResult> {
  const args = rawArgs as { key?: string; value?: string };
  if (!args.key?.trim() || !args.value?.trim()) return { success: false, message: "key and value required." };
  const { rememberPersonalFact } = await import("@/lib/personal-memory");
  const memory = await rememberPersonalFact(userId, args.key.toLowerCase().trim(), args.value.trim(), "assistant");
  return { success: true, message: `Remembered: ${memory.key} → ${memory.value}`, data: memory };
}

export async function executeGetExpenseSummary(userId: string): Promise<ToolResult> {
  const { getExpenseSummary } = await import("@/lib/expense-actions");
  const summary = await getExpenseSummary(userId);
  const byCategory = Object.entries(summary.byCategory)
    .map(([category, amount]) => `${category}: ₹${Math.round(amount)}`)
    .join(", ");
  return {
    success: true,
    message: `This month: ₹${Math.round(summary.total)} across ${summary.count} expenses. ${byCategory}${summary.alerts.length ? `\nAlerts: ${summary.alerts.join(" | ")}` : ""}`,
    data: summary,
  };
}

export const TOOL_DISPATCH: Record<string, (userId: string, args: unknown) => Promise<ToolResult>> = {
  saveKnowledgeItem: executeSaveKnowledgeItem,
  searchKnowledgeVault: executeSearchKnowledgeVault,
  logExpense: executeLogExpense,
  logHabit: executeLogHabit,
  createTask: executeCreateTask,
  createReminder: executeCreateReminder,
  listTasks: executeListTasks,
  completeTask: executeCompleteTask,
  getTodayOverview: executeGetOverview,
  runMorningOS: executeRunMorning,
  processMeeting: executeProcessMeeting,
  rememberFact: executeRememberFact,
  getExpenseSummary: executeGetExpenseSummary,
};

export const ALL_TOOLS_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "saveKnowledgeItem",
      description: "Save a web link or note text into the user's AI Second Brain (auto-scrapes link, extracts memory & tags).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Web link URL (e.g., https://ui.shadcn.com) or text note" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchKnowledgeVault",
      description: "Search via Exa.ai web search + local vault, then synthesize answer. Use for any question or search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query or natural language question" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "logExpense",
      description: "Log an expense from natural language e.g. 'spent 500 on lunch'",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "logHabit",
      description: "Log or create a habit streak",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          create: { type: "boolean", description: "Create new habit if true" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createTask",
      description: "Create a task. Optional natural due date like 'tomorrow', 'in 2 days', '2026-10-01 18:00'.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, due: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createReminder",
      description: "Set a reminder. 'when' accepts 'tomorrow', 'in 3 hours', or 'YYYY-MM-DD HH:mm'.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, when: { type: "string" } },
        required: ["text", "when"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listTasks",
      description: "List the user's open tasks.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "completeTask",
      description: "Mark a task complete by (partial) title.",
      parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getTodayOverview",
      description: "Get today's command-center summary: focus score, overdue tasks, spend, alerts, habits.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "runMorningOS",
      description: "Run the Morning OS agent: briefing + 3 focus tasks synced to calendar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "processMeeting",
      description: "Turn meeting notes/transcript into summary, decisions, tasks, and memories.",
      parameters: {
        type: "object",
        properties: { transcript: { type: "string" }, title: { type: "string" } },
        required: ["transcript"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "rememberFact",
      description: "Store a durable fact about the user (preferences, projects, people).",
      parameters: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getExpenseSummary",
      description: "Monthly spending total, by-category breakdown, and budget alerts.",
      parameters: { type: "object", properties: {} },
    },
  },
];
