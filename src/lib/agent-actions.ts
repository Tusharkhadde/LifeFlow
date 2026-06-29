/**
 * Agent Actions - Specific executors for each subsystem
 * Handles Task Manager, Reminder/Calendar, Expense Tracker, Goal Manager, Memory, Knowledge Base
 */

import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { callAI } from "@/lib/telegram-ai";
import { ExecutionResult } from "@/lib/agent-router";
import { parseISO, addDays, addWeeks, addMonths } from "date-fns";

// ==================== MEMORY SYSTEM ====================

interface MemoryEntry {
  id: string;
  userId: string;
  content: string;
  action: string;
  createdAt: Date;
}

// Simple in-memory store (upgrade to Redis for production)
const memoryStore = new Map<string, MemoryEntry[]>();

export async function storeMemory(
  userId: string,
  content: string,
  action: string
): Promise<void> {
  if (!memoryStore.has(userId)) {
    memoryStore.set(userId, []);
  }

  const entry: MemoryEntry = {
    id: Math.random().toString(),
    userId,
    content,
    action,
    createdAt: new Date(),
  };

  const userMemory = memoryStore.get(userId)!;
  userMemory.unshift(entry);

  // Keep only last 50 interactions
  if (userMemory.length > 50) {
    userMemory.pop();
  }
}

export async function queryMemory(
  userId: string,
  action: string,
  limit: number = 5
): Promise<MemoryEntry[]> {
  const userMemory = memoryStore.get(userId) || [];
  return userMemory
    .filter((m) => m.action === action)
    .slice(0, limit);
}

export async function clearMemory(userId: string): Promise<void> {
  memoryStore.delete(userId);
}

// ==================== TASK MANAGER ====================

export async function createTask(
  userId: string,
  params: any,
  chatId: number
): Promise<ExecutionResult> {
  try {
    const task = await prisma.task.create({
      data: {
        userId,
        title: params.title || params.text || "New Task",
        description: params.description,
        category: params.category || "general",
        urgency: params.urgency || "normal",
        dueDate: parseDateParam(params.dueDate),
      },
    });

    const message = `✅ Task created: "${task.title}"${task.dueDate ? ` due ${formatDate(task.dueDate)}` : ""}`;
    await sendTelegramMessage(chatId, message);

    return {
      success: true,
      message,
      data: task,
    };
  } catch (error) {
    // Don't log errors to avoid exposing data
    return {
      success: false,
      message: "Failed to create task. Please try again.",
    };
  }
}

// ==================== EXPENSE TRACKER ====================

export async function createExpense(
  userId: string,
  params: any,
  chatId: number
): Promise<ExecutionResult> {
  try {
    const amount = parseFloat(params.amount || params.value || "0");
    if (amount <= 0) {
      return {
        success: false,
        message: "Invalid amount. Please provide a valid number.",
      };
    }

    const expense = await prisma.expense.create({
      data: {
        userId,
        amount,
        category: params.category || "other",
        description: params.description || params.text,
        date: parseDateParam(params.date) || new Date(),
        source: "telegram",
      },
    });

    // Get monthly total
    const monthTotal = await prisma.expense.aggregate({
      where: {
        userId,
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { amount: true },
    });

    const message = `💰 Expense logged: ₹${amount} for ${params.category || "other"}\nMonth total: ₹${monthTotal._sum.amount || 0}`;
    await sendTelegramMessage(chatId, message);

    return {
      success: true,
      message,
      data: expense,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to log expense. Please try again.",
    };
  }
}

// ==================== REMINDER/CALENDAR SYSTEM ====================

export async function createReminder(
  userId: string,
  params: any,
  chatId: number
): Promise<ExecutionResult> {
  try {
    let datetime = parseDateParam(params.datetime || params.date);

    // Parse natural language time if needed
    if (!datetime && params.timeExpression) {
      datetime = parseNaturalDate(params.timeExpression);
    }

    if (!datetime) {
      return {
        success: false,
        message: "Could not understand the time. Try: 'tomorrow', 'next Monday', or '2024-02-15 3pm'",
        followUpQuestions: [
          "When would you like to be reminded?",
        ],
      };
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title: params.title || params.text || "Reminder",
        description: params.description,
        datetime,
        recurrence: params.recurrence || null,
        category: params.category || "general",
      },
    });

    const message = `🔔 Reminder set: "${reminder.title}"\nFor: ${formatDateTime(reminder.datetime)}`;
    await sendTelegramMessage(chatId, message);

    return {
      success: true,
      message,
      data: reminder,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to create reminder. Please try again.",
    };
  }
}

// ==================== GOAL MANAGER ====================

export async function createGoal(
  userId: string,
  params: any,
  chatId: number
): Promise<ExecutionResult> {
  try {
    const goal = await prisma.goal.create({
      data: {
        userId,
        title: params.title || params.text || "New Goal",
        description: params.description,
        category: params.category || "personal",
        target: params.target ? parseFloat(params.target) : null,
        unit: params.unit,
        deadline: parseDateParam(params.deadline),
        frequency: params.frequency || null,
      },
    });

    const message = `🎯 Goal created: "${goal.title}"${goal.target ? ` (Target: ${goal.target}${goal.unit || ""})` : ""}`;
    await sendTelegramMessage(chatId, message);

    return {
      success: true,
      message,
      data: goal,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to create goal. Please try again.",
    };
  }
}

// ==================== PLANNER (Organizes user requests) ====================

export async function planUserRequest(
  userId: string,
  userMessage: string
): Promise<any> {
  const prompt = `Break down this user request into actionable steps. Consider calendar, reminders, tasks, expenses.

Request: "${userMessage}"

Respond with JSON:
{
  "steps": ["step 1", "step 2", ...],
  "entities": { "tasks": [...], "reminders": [...], "expenses": [...] },
  "priority": "high|medium|low",
  "timeframe": "today|this_week|this_month|custom"
}`;

  try {
    const response = await callAI(
      "You are a planning assistant",
      prompt,
      400,
      0.7
    );

    if (!response) return null;
    return JSON.parse(response);
  } catch (e) {
    return null;
  }
}

// ==================== KNOWLEDGE BASE / DOCUMENT SEARCH ====================

export async function searchDocuments(
  userId: string,
  query: string,
  limit: number = 5
): Promise<ExecutionResult> {
  try {
    const documents = await prisma.document.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { extractedData: {} },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      message: `Found ${documents.length} documents`,
      data: documents,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to search documents. Please try again.",
    };
  }
}

// ==================== HELPERS ====================

function parseDateParam(dateString?: string): Date | null {
  if (!dateString) return null;

  try {
    // Try ISO date first
    const parsed = parseISO(dateString);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch (e) {
    // Fall through
  }

  // Try parsing as relative date like "tomorrow", "next week"
  const now = new Date();
  const lower = dateString.toLowerCase();

  if (lower === "today") return now;
  if (lower === "tomorrow") return addDays(now, 1);
  if (lower === "next week" || lower === "in a week")
    return addWeeks(now, 1);
  if (lower === "next month" || lower === "in a month")
    return addMonths(now, 1);
  if (lower.includes("day"))
    return addDays(now, parseInt(lower.match(/\d+/)?.[0] || "1"));
  if (lower.includes("week"))
    return addWeeks(now, parseInt(lower.match(/\d+/)?.[0] || "1"));
  if (lower.includes("month"))
    return addMonths(now, parseInt(lower.match(/\d+/)?.[0] || "1"));

  return null;
}

function parseNaturalDate(expression: string): Date | null {
  const now = new Date();
  const lower = expression.toLowerCase().trim();

  // Simple cases
  if (lower === "now") return now;
  if (lower === "today" || lower === "today at 9am") return now;
  if (lower === "tomorrow") return addDays(now, 1);
  if (lower === "in 1 hour") return new Date(now.getTime() + 3600000);
  if (lower === "in 30 minutes") return new Date(now.getTime() + 1800000);

  // Match patterns like "tomorrow at 3pm", "next monday 2pm"
  const timeMatch = expression.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (timeMatch) {
    const result = new Date(now);
    let hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]) || 0;
    const period = timeMatch[3]?.toLowerCase();

    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    result.setHours(hour, minute, 0, 0);
    return result;
  }

  return null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
