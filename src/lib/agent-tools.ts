import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

// Helper for structured logging
function logToolExecution(toolName: string, userId: string, args: unknown, status: "START" | "SUCCESS" | "ERROR", details?: unknown) {
  const timestamp = new Date().toISOString();
  console.log(`[TOOL_LOG][${timestamp}][${toolName}][User:${userId}][${status}]`, {
    args,
    details: details instanceof Error ? { message: details.message, stack: details.stack } : details,
  });
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 2,
  delayMs: number = 300
): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      await new Promise((res) => setTimeout(res, delayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error("Retry attempts exhausted");
}

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
  followUpQuestions?: string[];
}

// ----------------------------------------------------
// 1. Tool: createExpense
// ----------------------------------------------------
export const createExpenseSchema = z.object({
  amount: z.number().gt(0, "Amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  merchant: z.string().optional(),
  date: z.string().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export async function executeCreateExpense(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("createExpense", userId, rawArgs, "START");
  try {
    const parseResult = createExpenseSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
      logToolExecution("createExpense", userId, rawArgs, "ERROR", errorMsg);
      return {
        success: false,
        message: `Validation error: ${errorMsg}`,
        followUpQuestions: ["Could you specify the expense amount and category?"],
      };
    }

    const { amount, category, description, merchant, date } = parseResult.data;
    const finalDesc = description || merchant || category;
    const parsedDate = date ? new Date(date) : new Date();
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const expense = await withRetry(() =>
      prisma.expense.create({
        data: {
          userId,
          amount,
          category: category.toLowerCase(),
          description: finalDesc,
          date: validDate,
          type: "expense",
          source: "telegram",
        },
      })
    );

    const monthTotal = await prisma.expense.aggregate({
      where: {
        userId,
        type: "expense",
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { amount: true },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const budget = user?.monthlyBudget || 25000;
    const totalSpent = monthTotal._sum.amount || amount;
    const remaining = budget - totalSpent;

    const message = `Done! I've added ₹${amount.toLocaleString()} as a ${category} expense (${finalDesc}).\nMonthly spent: ₹${totalSpent.toLocaleString()} / ₹${budget.toLocaleString()} (${remaining >= 0 ? `₹${remaining.toLocaleString()} left` : `₹${Math.abs(remaining).toLocaleString()} over budget`}).`;

    if (chatId) {
      await sendTelegramMessage(chatId, message);
    }

    logToolExecution("createExpense", userId, rawArgs, "SUCCESS", expense);
    return { success: true, message, data: expense };
  } catch (error) {
    logToolExecution("createExpense", userId, rawArgs, "ERROR", error);
    return {
      success: false,
      message: "Failed to record expense. Please try again.",
    };
  }
}

// ----------------------------------------------------
// 2. Tool: createIncome
// ----------------------------------------------------
export const createIncomeSchema = z.object({
  amount: z.number().gt(0, "Amount must be greater than 0"),
  category: z.string().default("Salary"),
  description: z.string().optional(),
  source: z.string().optional(),
  date: z.string().optional(),
});

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

export async function executeCreateIncome(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("createIncome", userId, rawArgs, "START");
  try {
    const parseResult = createIncomeSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
      logToolExecution("createIncome", userId, rawArgs, "ERROR", errorMsg);
      return {
        success: false,
        message: `Validation error: ${errorMsg}`,
        followUpQuestions: ["How much income was credited?"],
      };
    }

    const { amount, category, description, source, date } = parseResult.data;
    const finalDesc = description || source || category;
    const parsedDate = date ? new Date(date) : new Date();
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const income = await withRetry(() =>
      prisma.expense.create({
        data: {
          userId,
          amount,
          category: category.toLowerCase(),
          description: finalDesc,
          date: validDate,
          type: "income",
          source: "telegram",
        },
      })
    );

    const message = `Awesome! Logged ₹${amount.toLocaleString()} income under ${category} (${finalDesc}).`;

    if (chatId) {
      await sendTelegramMessage(chatId, message);
    }

    logToolExecution("createIncome", userId, rawArgs, "SUCCESS", income);
    return { success: true, message, data: income };
  } catch (error) {
    logToolExecution("createIncome", userId, rawArgs, "ERROR", error);
    return {
      success: false,
      message: "Failed to record income. Please try again.",
    };
  }
}

// ----------------------------------------------------
// 3. Tool: searchExpenses
// ----------------------------------------------------
export const searchExpensesSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().default(10),
});

export type SearchExpensesInput = z.infer<typeof searchExpensesSchema>;

export async function executeSearchExpenses(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("searchExpenses", userId, rawArgs, "START");
  try {
    const parseResult = searchExpensesSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      return { success: false, message: "Invalid search query arguments." };
    }

    const { query, category, minAmount, maxAmount, startDate, endDate, limit } = parseResult.data;

    const whereClause: Record<string, unknown> = {
      userId,
      type: "expense",
    };

    if (category) whereClause.category = { contains: category, mode: "insensitive" };
    if (query) whereClause.description = { contains: query, mode: "insensitive" };
    if (minAmount !== undefined || maxAmount !== undefined) {
      whereClause.amount = {};
      if (minAmount !== undefined) (whereClause.amount as Record<string, number>).gte = minAmount;
      if (maxAmount !== undefined) (whereClause.amount as Record<string, number>).lte = maxAmount;
    }
    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) (whereClause.date as Record<string, Date>).gte = new Date(startDate);
      if (endDate) (whereClause.date as Record<string, Date>).lte = new Date(endDate);
    }

    const expenses = await withRetry(() =>
      prisma.expense.findMany({
        where: whereClause,
        orderBy: { date: "desc" },
        take: limit,
      })
    );

    if (expenses.length === 0) {
      const msg = "No matching expenses found for your query.";
      if (chatId) await sendTelegramMessage(chatId, msg);
      return { success: true, message: msg, data: [] };
    }

    const total = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    const summaryLines = expenses.map(
      (e, idx) => `${idx + 1}. ₹${e.amount.toLocaleString()} - ${e.category} (${e.description || "No description"}) on ${new Date(e.date).toLocaleDateString()}`
    );

    const message = `Found ${expenses.length} expense(s) totaling ₹${total.toLocaleString()}:\n${summaryLines.join("\n")}`;
    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("searchExpenses", userId, rawArgs, "SUCCESS", expenses);
    return { success: true, message, data: expenses };
  } catch (error) {
    logToolExecution("searchExpenses", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to search expenses." };
  }
}

// ----------------------------------------------------
// 4. Tool: updateBudget
// ----------------------------------------------------
export const updateBudgetSchema = z.object({
  monthlyBudget: z.number().gt(0, "Monthly budget must be greater than 0"),
});

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export async function executeUpdateBudget(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("updateBudget", userId, rawArgs, "START");
  try {
    const parseResult = updateBudgetSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return {
        success: false,
        message: "Please specify a valid numeric budget amount.",
        followUpQuestions: ["What monthly budget amount would you like to set?"],
      };
    }

    const { monthlyBudget } = parseResult.data;

    const user = await withRetry(() =>
      prisma.user.update({
        where: { id: userId },
        data: { monthlyBudget },
      })
    );

    const message = `Monthly budget successfully updated to ₹${monthlyBudget.toLocaleString()}.`;
    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("updateBudget", userId, rawArgs, "SUCCESS", user);
    return { success: true, message, data: user };
  } catch (error) {
    logToolExecution("updateBudget", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to update budget." };
  }
}

// ----------------------------------------------------
// 5. Tool: createReminder
// ----------------------------------------------------
export const createReminderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  datetime: z.string().min(1, "Datetime is required"),
  category: z.string().default("general"),
  description: z.string().optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export async function executeCreateReminder(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("createReminder", userId, rawArgs, "START");
  try {
    const parseResult = createReminderSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return {
        success: false,
        message: "Missing reminder details.",
        followUpQuestions: ["What should I remind you about and when?"],
      };
    }

    const { title, datetime, category, description } = parseResult.data;
    const parsedDate = new Date(datetime);
    const validDate = isNaN(parsedDate.getTime()) ? new Date(Date.now() + 3600 * 1000) : parsedDate;

    const reminder = await withRetry(() =>
      prisma.reminder.create({
        data: {
          userId,
          title,
          description,
          category,
          datetime: validDate,
        },
      })
    );

    const formattedTime = validDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const message = `Reminder set! I'll remind you to "${title}" on ${formattedTime}.`;

    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("createReminder", userId, rawArgs, "SUCCESS", reminder);
    return { success: true, message, data: reminder };
  } catch (error) {
    logToolExecution("createReminder", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to create reminder." };
  }
}

// ----------------------------------------------------
// 6. Tool: createTask
// ----------------------------------------------------
export const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  category: z.string().default("general"),
  urgency: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueDate: z.string().optional(),
  description: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export async function executeCreateTask(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("createTask", userId, rawArgs, "START");
  try {
    const parseResult = createTaskSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return {
        success: false,
        message: "Task title is required.",
        followUpQuestions: ["What is the task title?"],
      };
    }

    const { title, category, urgency, dueDate, description } = parseResult.data;
    const parsedDue = dueDate ? new Date(dueDate) : null;
    const validDue = parsedDue && !isNaN(parsedDue.getTime()) ? parsedDue : null;

    const task = await withRetry(() =>
      prisma.task.create({
        data: {
          userId,
          title,
          description,
          category,
          urgency,
          dueDate: validDue,
        },
      })
    );

    const dueStr = validDue ? ` (Due: ${validDue.toLocaleDateString()})` : "";
    const message = `Task added: "${title}" [${urgency.toUpperCase()}]${dueStr}.`;

    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("createTask", userId, rawArgs, "SUCCESS", task);
    return { success: true, message, data: task };
  } catch (error) {
    logToolExecution("createTask", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to create task." };
  }
}

// ----------------------------------------------------
// 7. Tool: createGoal
// ----------------------------------------------------
export const createGoalSchema = z.object({
  title: z.string().min(1, "Goal title is required"),
  target: z.number().optional(),
  current: z.number().default(0),
  unit: z.string().optional(),
  deadline: z.string().optional(),
  category: z.string().default("personal"),
  description: z.string().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export async function executeCreateGoal(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("createGoal", userId, rawArgs, "START");
  try {
    const parseResult = createGoalSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return {
        success: false,
        message: "Goal title is required.",
        followUpQuestions: ["What goal would you like to set?"],
      };
    }

    const { title, target, current, unit, deadline, category, description } = parseResult.data;
    const parsedDeadline = deadline ? new Date(deadline) : null;
    const validDeadline = parsedDeadline && !isNaN(parsedDeadline.getTime()) ? parsedDeadline : null;

    const goal = await withRetry(() =>
      prisma.goal.create({
        data: {
          userId,
          title,
          description,
          category,
          target: target || null,
          current,
          unit: unit || (target ? "rupees" : null),
          deadline: validDeadline,
        },
      })
    );

    const targetStr = target ? ` Target: ${target.toLocaleString()} ${unit || ""}` : "";
    const message = `Goal created: "${title}"!${targetStr}`;

    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("createGoal", userId, rawArgs, "SUCCESS", goal);
    return { success: true, message, data: goal };
  } catch (error) {
    logToolExecution("createGoal", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to create goal." };
  }
}

// ----------------------------------------------------
// 8. Tool: getAnalytics
// ----------------------------------------------------
export const getAnalyticsSchema = z.object({
  timeframe: z.enum(["this_month", "last_month", "all_time"]).default("this_month"),
  category: z.string().optional(),
});

export type GetAnalyticsInput = z.infer<typeof getAnalyticsSchema>;

export async function executeGetAnalytics(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("getAnalytics", userId, rawArgs, "START");
  try {
    const parseResult = getAnalyticsSchema.safeParse(rawArgs || {});
    const timeframe = parseResult.success ? parseResult.data.timeframe : "this_month";

    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (timeframe === "this_month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeframe === "last_month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    const [user, expenses, incomeRecords, pendingTasks, activeGoals] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.expense.findMany({
        where: {
          userId,
          type: "expense",
          ...(startDate || endDate ? { date: dateFilter } : {}),
        },
      }),
      prisma.expense.findMany({
        where: {
          userId,
          type: "income",
          ...(startDate || endDate ? { date: dateFilter } : {}),
        },
      }),
      prisma.task.count({ where: { userId, completed: false } }),
      prisma.goal.count({ where: { userId, completed: false } }),
    ]);

    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = incomeRecords.reduce((sum, i) => sum + i.amount, 0);
    const monthlyBudget = user?.monthlyBudget || 25000;

    const categoryTotals: Record<string, number> = {};
    expenses.forEach((e) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => `• ${cat}: ₹${amt.toLocaleString()}`)
      .join("\n");

    const message = `📊 *Financial & Life Summary (${timeframe.replace("_", " ")})*\n` +
      `• Total Spent: ₹${totalExpense.toLocaleString()} / Budget: ₹${monthlyBudget.toLocaleString()}\n` +
      `• Total Income: ₹${totalIncome.toLocaleString()}\n` +
      `• Net Balance: ₹${(totalIncome - totalExpense).toLocaleString()}\n` +
      (topCategories ? `\nTop Spending Categories:\n${topCategories}\n` : "") +
      `\n• Open Tasks: ${pendingTasks}\n• Active Goals: ${activeGoals}`;

    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("getAnalytics", userId, rawArgs, "SUCCESS", { totalExpense, totalIncome });
    return {
      success: true,
      message,
      data: { totalExpense, totalIncome, monthlyBudget, categoryTotals, pendingTasks, activeGoals },
    };
  } catch (error) {
    logToolExecution("getAnalytics", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to generate analytics." };
  }
}

// ----------------------------------------------------
// 9. Tool: updateProfile
// ----------------------------------------------------
export const updateProfileSchema = z.object({
  name: z.string().optional(),
  language: z.string().optional(),
  preferredModel: z.string().optional(),
  displayUsername: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function executeUpdateProfile(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("updateProfile", userId, rawArgs, "START");
  try {
    const parseResult = updateProfileSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      return { success: false, message: "Invalid profile update parameters." };
    }

    const { name, language, preferredModel, displayUsername } = parseResult.data;

    if (name || language || displayUsername) {
      await withRetry(() =>
        prisma.user.update({
          where: { id: userId },
          data: {
            ...(name ? { name } : {}),
            ...(language ? { language } : {}),
            ...(displayUsername ? { displayUsername } : {}),
          },
        })
      );
    }

    if (preferredModel) {
      await withRetry(() =>
        prisma.telegramLink.updateMany({
          where: { userId },
          data: { preferredModel },
        })
      );
    }

    const message = "Profile preferences updated successfully.";
    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("updateProfile", userId, rawArgs, "SUCCESS");
    return { success: true, message };
  } catch (error) {
    logToolExecution("updateProfile", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to update profile." };
  }
}

// ----------------------------------------------------
// 10. Tool: queryDatabase
// ----------------------------------------------------
export const queryDatabaseSchema = z.object({
  entityType: z.enum(["expenses", "tasks", "goals", "reminders", "documents", "all"]).default("all"),
  status: z.enum(["pending", "completed", "all"]).default("all"),
  search: z.string().optional(),
  limit: z.number().default(5),
});

export type QueryDatabaseInput = z.infer<typeof queryDatabaseSchema>;

export async function executeQueryDatabase(
  userId: string,
  rawArgs: unknown,
  chatId?: number
): Promise<ToolResult> {
  logToolExecution("queryDatabase", userId, rawArgs, "START");
  try {
    const parseResult = queryDatabaseSchema.safeParse(rawArgs || {});
    const { entityType, status, search, limit } = parseResult.success ? parseResult.data : { entityType: "all", status: "all", limit: 5, search: undefined };

    const results: Record<string, unknown> = {};

    if (entityType === "tasks" || entityType === "all") {
      results.tasks = await prisma.task.findMany({
        where: {
          userId,
          ...(status === "pending" ? { completed: false } : status === "completed" ? { completed: true } : {}),
          ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      });
    }

    if (entityType === "expenses" || entityType === "all") {
      results.expenses = await prisma.expense.findMany({
        where: {
          userId,
          ...(search ? { description: { contains: search, mode: "insensitive" } } : {}),
        },
        take: limit,
        orderBy: { date: "desc" },
      });
    }

    if (entityType === "goals" || entityType === "all") {
      results.goals = await prisma.goal.findMany({
        where: {
          userId,
          ...(status === "pending" ? { completed: false } : status === "completed" ? { completed: true } : {}),
          ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
        },
        take: limit,
      });
    }

    if (entityType === "reminders" || entityType === "all") {
      results.reminders = await prisma.reminder.findMany({
        where: {
          userId,
          ...(status === "pending" ? { completed: false } : status === "completed" ? { completed: true } : {}),
        },
        take: limit,
        orderBy: { datetime: "asc" },
      });
    }

    const message = `Database query complete for ${entityType}.`;
    if (chatId) await sendTelegramMessage(chatId, message);

    logToolExecution("queryDatabase", userId, rawArgs, "SUCCESS", results);
    return { success: true, message, data: results };
  } catch (error) {
    logToolExecution("queryDatabase", userId, rawArgs, "ERROR", error);
    return { success: false, message: "Failed to query database." };
  }
}

// Map tool names to handler execution functions
export const TOOL_DISPATCH: Record<
  string,
  (userId: string, args: unknown, chatId?: number) => Promise<ToolResult>
> = {
  createExpense: executeCreateExpense,
  createIncome: executeCreateIncome,
  searchExpenses: executeSearchExpenses,
  updateBudget: executeUpdateBudget,
  createReminder: executeCreateReminder,
  createTask: executeCreateTask,
  createGoal: executeCreateGoal,
  getAnalytics: executeGetAnalytics,
  updateProfile: executeUpdateProfile,
  queryDatabase: executeQueryDatabase,
};

// Open API Tool Definitions for LLM Function Calling
export const ALL_TOOLS_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "createExpense",
      description: "Record an expense item (e.g. bought mouse for ₹2000, paid rent 18000, spent 250 on coffee).",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Expense amount in rupees" },
          category: { type: "string", description: "Category (e.g., Electronics, Food, Rent, Shopping, Transport, Utilities)" },
          description: { type: "string", description: "Item description or note" },
          merchant: { type: "string", description: "Store or merchant name if mentioned" },
          date: { type: "string", description: "Date of expense in ISO or YYYY-MM-DD format if specified" },
        },
        required: ["amount", "category"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createIncome",
      description: "Record credited income (e.g. Salary credited 70000, Freelance payout 15000).",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Income amount in rupees" },
          category: { type: "string", description: "Income category (e.g., Salary, Freelance, Bonus, Investment)" },
          description: { type: "string", description: "Source or description of income" },
          source: { type: "string", description: "Payer or source name" },
          date: { type: "string", description: "Date of credit" },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchExpenses",
      description: "Search and filter recorded expenses by category, date range, or description keyword.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword search in expense descriptions" },
          category: { type: "string", description: "Filter by category" },
          minAmount: { type: "number", description: "Minimum amount filter" },
          maxAmount: { type: "number", description: "Maximum amount filter" },
          startDate: { type: "string", description: "Start date" },
          endDate: { type: "string", description: "End date" },
          limit: { type: "number", description: "Max results to return (default 10)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateBudget",
      description: "Set or update the user's monthly expense budget (e.g. Set my monthly budget to 25000).",
      parameters: {
        type: "object",
        properties: {
          monthlyBudget: { type: "number", description: "New monthly budget limit in rupees" },
        },
        required: ["monthlyBudget"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createReminder",
      description: "Create a reminder with a specific date and time (e.g. Remind me to pay bill tomorrow at 5pm).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Reminder description" },
          datetime: { type: "string", description: "Target date and time (ISO format or parsed timestamp)" },
          category: { type: "string", description: "Category" },
          description: { type: "string", description: "Additional details" },
        },
        required: ["title", "datetime"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createTask",
      description: "Create a to-do task (e.g. Need to file taxes by next Friday, urgent).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          category: { type: "string", description: "Task category" },
          urgency: { type: "string", enum: ["low", "normal", "high", "urgent"], description: "Priority / urgency" },
          dueDate: { type: "string", description: "Due date" },
          description: { type: "string", description: "Task details" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createGoal",
      description: "Set a savings or personal goal (e.g. Save ₹50,000 for trip by December).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Goal title" },
          target: { type: "number", description: "Target amount in rupees" },
          current: { type: "number", description: "Initial current amount saved" },
          unit: { type: "string", description: "Unit of target (e.g. rupees)" },
          deadline: { type: "string", description: "Target deadline date" },
          category: { type: "string", description: "Goal category" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getAnalytics",
      description: "Generate and return a visual financial analytics summary (spent vs budget, income, top spending categories).",
      parameters: {
        type: "object",
        properties: {
          timeframe: { type: "string", enum: ["this_month", "last_month", "all_time"], description: "Timeframe for analytics" },
          category: { type: "string", description: "Specific category filter" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateProfile",
      description: "Update user preferences (name, language, preferred AI model).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "User's preferred display name" },
          language: { type: "string", description: "Language preference (e.g. en, hi)" },
          preferredModel: { type: "string", description: "Preferred LLM model ID" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "queryDatabase",
      description: "Flexible query for user's tasks, expenses, goals, reminders, and documents.",
      parameters: {
        type: "object",
        properties: {
          entityType: { type: "string", enum: ["expenses", "tasks", "goals", "reminders", "documents", "all"] },
          status: { type: "string", enum: ["pending", "completed", "all"] },
          search: { type: "string", description: "Search keyword" },
          limit: { type: "number", description: "Limit" },
        },
      },
    },
  },
];
