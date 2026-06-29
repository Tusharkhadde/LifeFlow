/**
 * Agent Router - Central orchestration system for Telegram messages
 * Flows: Telegram → Router → Planner → Memory → Executor → Subsystems
 */

import { prisma } from "@/lib/db";
import { callAI } from "@/lib/telegram-ai";
import {
  createTask,
  createExpense,
  createReminder,
  createGoal,
  queryMemory,
  storeMemory,
  MemoryEntry,
  ActionParams,
} from "@/lib/agent-actions";

export type ActionType =
  | "create_task"
  | "create_expense"
  | "create_reminder"
  | "set_goal"
  | "query_calendar"
  | "general_chat"
  | "view_summary"
  | "document_upload"
  | "ask_knowledge_base";

export interface Message {
  text: string;
  telegramUserId: number;
  chatId: number;
  hasAttachment?: boolean;
  attachmentType?: "image" | "document";
}

export interface Plan {
  primaryAction: ActionType;
  confidence: number;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  contextNeeded: string[];
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
  followUpQuestions?: string[];
}

class AgentRouter {
  private systemPrompt = `You are LifeFlow's intelligent agent router. Analyze the user's message and:

1. Classify the intent into one of: create_task, create_expense, create_reminder, set_goal, query_calendar, general_chat, view_summary, document_upload, ask_knowledge_base
2. Extract parameters needed for the action
3. Determine if it needs clarification

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "action": "action_name",
  "confidence": 0.0-1.0,
  "parameters": { extracted parameters },
  "requiresConfirmation": boolean,
  "clarifications": ["questions if needed"]
}`;

  async route(message: Message): Promise<ExecutionResult> {
    try {
      // 1. Get user context
      const telegramLink = await prisma.telegramLink.findUnique({
        where: { telegramUserId: BigInt(message.telegramUserId) },
        include: { user: true },
      });

      if (!telegramLink) {
        return {
          success: false,
          message: "User not linked. Please link your account first.",
        };
      }

      const userId = telegramLink.userId;
      const user = telegramLink.user;

      // 2. Plan - Use AI to understand intent
      const plan = await this.createPlan(message.text, userId, user);

      if (plan.confidence < 0.5 && plan.primaryAction !== "general_chat") {
        return {
          success: false,
          message: "I didn't quite understand that. Could you rephrase?",
          followUpQuestions: plan.contextNeeded,
        };
      }

      // 3. Memory - Store and retrieve context
      await storeMemory(userId, message.text, plan.primaryAction);
      const relatedMemory = await queryMemory(userId, plan.primaryAction);

      // 4. Execute
      const result = await this.execute(plan, userId, message, relatedMemory);

      return result;
    } catch (_error) {
      return {
        success: false,
        message: "Something went wrong. Please try again later.",
      };
    }
  }

  private async createPlan(
    text: string,
    userId: string,
    user: { name?: string | null; language?: string | null }
  ): Promise<Plan> {
    const userContext = `
User: ${user.name || "Friend"}
Language: ${user.language}
Tasks pending: ${await prisma.task.count({ where: { userId, completed: false } })}
Today's date: ${new Date().toLocaleDateString()}
`;

    try {
      const response = await callAI(
        this.systemPrompt,
        `${userContext}\n\nUser message: "${text}"`,
        500,
        0.7
      );

      if (!response) {
        // Fallback to local extraction if AI unavailable
        return this.fallbackPlan(text);
      }

      const parsed = JSON.parse(response);
      return {
        primaryAction: parsed.action as ActionType,
        confidence: parsed.confidence,
        parameters: parsed.parameters,
        requiresConfirmation: parsed.requiresConfirmation,
        contextNeeded: parsed.clarifications || [],
      };
    } catch (_e) {
      // Silent fail - use fallback
      return this.fallbackPlan(text);
    }
  }

  private fallbackPlan(text: string): Plan {
    // Local pattern matching without AI
    const lower = text.toLowerCase();

    if (lower.match(/spent|paid|bought|cost|₹|rs\./)) {
      return {
        primaryAction: "create_expense",
        confidence: 0.7,
        parameters: { text },
        requiresConfirmation: false,
        contextNeeded: [],
      };
    }
    if (lower.match(/remind|don't forget|remember|set a reminder/)) {
      return {
        primaryAction: "create_reminder",
        confidence: 0.7,
        parameters: { text },
        requiresConfirmation: false,
        contextNeeded: [],
      };
    }
    if (lower.match(/need to|have to|must|todo|task|i should|i gotta/)) {
      return {
        primaryAction: "create_task",
        confidence: 0.7,
        parameters: { text },
        requiresConfirmation: false,
        contextNeeded: [],
      };
    }
    if (lower.match(/save|goal|target/)) {
      return {
        primaryAction: "set_goal",
        confidence: 0.6,
        parameters: { text },
        requiresConfirmation: false,
        contextNeeded: [],
      };
    }

    // Default to general chat
    return {
      primaryAction: "general_chat",
      confidence: 0.5,
      parameters: { text },
      requiresConfirmation: false,
      contextNeeded: [],
    };
  }

  private async execute(
    plan: Plan,
    userId: string,
    message: Message,
    memory: MemoryEntry[]
  ): Promise<ExecutionResult> {
    const params = plan.parameters as ActionParams;

    switch (plan.primaryAction) {
      case "create_task":
        return createTask(userId, params, message.chatId);

      case "create_expense":
        return createExpense(userId, params, message.chatId);

      case "create_reminder":
        return createReminder(userId, params, message.chatId);

      case "set_goal":
        return createGoal(userId, params, message.chatId);

      case "query_calendar":
        return this.handleCalendarQuery(userId, params);

      case "view_summary":
        return this.handleSummary(userId, message.chatId);

      case "general_chat":
        return this.handleGeneralChat(message.text, userId, memory);

      case "ask_knowledge_base":
        return this.handleKnowledgeBase(userId, params, memory);

      default:
        return {
          success: false,
          message: "Action not recognized",
        };
    }
  }

  private async handleCalendarQuery(
    userId: string,
    _params: unknown
  ): Promise<ExecutionResult> {
    const reminders = await prisma.reminder.findMany({
      where: { userId, completed: false },
      orderBy: { datetime: "asc" },
      take: 5,
    });

    return {
      success: true,
      message: `📅 Upcoming reminders:\n${reminders.map((r) => `• ${r.title} - ${r.datetime.toLocaleDateString()}`).join("\n")}`,
      data: reminders,
    };
  }

  private async handleSummary(
    userId: string,
    _chatId: number
  ): Promise<ExecutionResult> {
    const tasks = await prisma.task.count({
      where: { userId, completed: false },
    });
    const expenses = await prisma.expense.aggregate({
      where: { userId },
      _sum: { amount: true },
      _count: true,
    });
    const goals = await prisma.goal.count({ where: { userId } });
    const reminders = await prisma.reminder.count({
      where: { userId, completed: false },
    });

    return {
      success: true,
      message: `📊 Your LifeFlow Summary:\n• ${tasks} tasks pending\n• ₹${expenses._sum.amount || 0} total expenses\n• ${goals} goals\n• ${reminders} active reminders`,
      data: { tasks, expenses: expenses._sum.amount || 0, goals, reminders },
    };
  }

  private async handleGeneralChat(
    text: string,
    userId: string,
    memory: MemoryEntry[]
  ): Promise<ExecutionResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tasks = await prisma.task.count({
      where: { userId, completed: false },
    });
    const expenses = await prisma.expense.aggregate({
      where: { userId },
      _sum: { amount: true },
    });

    const contextPrompt = `You are LifeFlow AI, friendly and concise (max 3 sentences). 
Today: ${new Date().toLocaleDateString()}.
User: ${user?.name}.
Their stats: ${tasks} tasks, ₹${expenses._sum.amount || 0} spent.
${memory.length > 0 ? `Related context: ${memory.map((m) => m.content).join("; ")}` : ""}

Keep responses natural and helpful.`;

    const response = await callAI(contextPrompt, text, 300, 0.8);

    return {
      success: true,
      message: response || "I'm here to help!",
      data: { recentMemory: memory },
    };
  }

  private async handleKnowledgeBase(
    userId: string,
    _params: unknown,
    memory: MemoryEntry[]
  ): Promise<ExecutionResult> {
    const documents = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      success: true,
      message: `📚 Found ${documents.length} documents related to your query`,
      data: { documents, relatedMemory: memory },
    };
  }
}

export const agentRouter = new AgentRouter();
