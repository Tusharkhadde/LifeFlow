import { prisma } from "@/lib/db";

// ---- Background entity extractor (strict JSON, low creativity) ----

const EXTRACTOR_PROMPT = `You are an entity extractor. Analyze the user message and detect if it contains actionable items.

Today's date: {DATE}

Return ONLY a valid JSON object:
{
  "hasEntities": true/false,
  "tasks": [{ "title": "string", "description": null, "category": "general", "urgency": "normal", "dueDate": "YYYY-MM-DD|null" }],
  "expenses": [{ "amount": number, "category": "food|transport|subscriptions|utilities|shopping|health|education|other", "description": null, "date": "YYYY-MM-DD|null" }],
  "goals": [{ "title": "string", "description": null, "category": "personal", "target": null, "unit": null, "deadline": "YYYY-MM-DD|null" }],
  "reminders": [{ "title": "string", "description": null, "datetime": "YYYY-MM-DDTHH:MM:SS|null", "category": "general" }]
}

Rules:
- "I spent ₹500 on groceries" → expense {amount:500, category:"food"}
- "Remind me to call mom tomorrow at 5pm" → reminder {title:"Call mom", datetime:"2026-06-27T17:00:00"}
- "File taxes by April 15th, urgent" → task {title:"File taxes", urgency:"high", dueDate:"2026-04-15"}
- "Save 50k for a trip" → goal {title:"Save for trip", target:50000, unit:"rupees"}
- "What's the news?" → hasEntities: false (no entities)
- "How are you?" → hasEntities: false
- Only extract REAL actionable items. Don't extract questions or conversation.`;

// ---- Conversational chat prompt (natural, friendly) ----

const CHAT_PROMPT = `You are LifeFlow AI, a friendly and smart personal assistant living inside Telegram. You're chatting with a real person.

Personality:
- Be conversational, warm, and helpful — like a knowledgeable friend
- Use casual language, not robotic phrasing
- Give real, useful answers — not generic responses
- Be witty when appropriate
- Keep responses concise but not too short (1-3 paragraphs max)
- Use *bold* for emphasis when natural

You know about their life data:
- {TASK_COUNT} pending tasks ({HIGH_URGENCY} high urgency)
- ₹{EXPENSE_TOTAL} spent this month
- {GOAL_COUNT} active goals
- {REMINDER_COUNT} pending reminders

You can help with:
- General chat, questions, opinions, jokes, facts, advice
- Tasks, expenses, goals, reminders management
- Life advice, productivity tips, recommendations
- Anything a helpful assistant would know

{ENTITY_CONTEXT}

Just respond naturally. No JSON, no structured format — just talk like a real person.`;

interface ExtractedEntities {
  hasEntities: boolean;
  tasks: Array<{
    title: string;
    description?: string | null;
    category?: string;
    urgency?: string;
    dueDate?: string | null;
  }>;
  expenses: Array<{
    amount: number;
    category?: string;
    description?: string | null;
    date?: string | null;
  }>;
  goals: Array<{
    title: string;
    description?: string | null;
    category?: string;
    target?: number | null;
    unit?: string | null;
    deadline?: string | null;
  }>;
  reminders: Array<{
    title: string;
    description?: string | null;
    datetime?: string | null;
    category?: string;
  }>;
}

async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.tokenrouter.com/v1";
  const model = process.env.OPENAI_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

function parseExtractedJSON(raw: string): ExtractedEntities | null {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as ExtractedEntities;
  } catch {
    return null;
  }
}

function buildEntityContext(entities: ExtractedEntities): string {
  const parts: string[] = [];
  if (entities.tasks?.length) parts.push(`${entities.tasks.length} new task(s) just added`);
  if (entities.expenses?.length) parts.push(`${entities.expenses.length} new expense(s) just logged`);
  if (entities.goals?.length) parts.push(`${entities.goals.length} new goal(s) just created`);
  if (entities.reminders?.length) parts.push(`${entities.reminders.length} new reminder(s) just set`);
  return parts.length > 0
    ? `IMPORTANT: The user just created items. Acknowledge them naturally in your response:\n${parts.join("\n")}`
    : "";
}

async function saveEntities(userId: string, entities: ExtractedEntities): Promise<string[]> {
  const created: string[] = [];

  for (const t of entities.tasks || []) {
    await prisma.task.create({
      data: {
        userId,
        title: t.title,
        description: t.description || null,
        category: t.category || "general",
        urgency: t.urgency || "normal",
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
      },
    });
    created.push(t.title);
  }

  for (const e of entities.expenses || []) {
    await prisma.expense.create({
      data: {
        userId,
        amount: e.amount,
        category: e.category || "other",
        description: e.description || null,
        date: e.date ? new Date(e.date) : new Date(),
        source: "telegram",
      },
    });
    created.push(`₹${e.amount} ${e.category || "expense"}`);
  }

  for (const g of entities.goals || []) {
    await prisma.goal.create({
      data: {
        userId,
        title: g.title,
        description: g.description || null,
        category: g.category || "personal",
        target: g.target || null,
        current: 0,
        unit: g.unit || null,
        deadline: g.deadline ? new Date(g.deadline) : null,
      },
    });
    created.push(g.title);
  }

  for (const r of entities.reminders || []) {
    await prisma.reminder.create({
      data: {
        userId,
        title: r.title,
        description: r.description || null,
        datetime: r.datetime ? new Date(r.datetime) : new Date(),
        category: r.category || "general",
      },
    });
    created.push(r.title);
  }

  return created;
}

export async function handleMessage(
  message: string,
  userId: string
): Promise<string> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Fetch user data for context
  const [tasks, expenses, goals, reminders] = await Promise.all([
    prisma.task.findMany({ where: { userId, completed: false } }),
    prisma.expense.findMany({
      where: {
        userId,
        date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
    }),
    prisma.goal.findMany({ where: { userId, completed: false } }),
    prisma.reminder.findMany({ where: { userId, completed: false } }),
  ]);

  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const highUrgency = tasks.filter((t) => t.urgency === "high").length;

  // Run both AI calls in parallel:
  // 1. Extractor — detects entities (low temp, strict JSON)
  // 2. Chat — generates natural response (higher temp, conversational)
  const extractorPrompt = EXTRACTOR_PROMPT.replace("{DATE}", todayStr);
  const chatPrompt = CHAT_PROMPT
    .replace("{TASK_COUNT}", String(tasks.length))
    .replace("{HIGH_URGENCY}", String(highUrgency))
    .replace("{EXPENSE_TOTAL}", expenseTotal.toLocaleString())
    .replace("{GOAL_COUNT}", String(goals.length))
    .replace("{REMINDER_COUNT}", String(reminders.length))
    .replace("{ENTITY_CONTEXT}", "");

  const [extractorRaw, chatRaw] = await Promise.all([
    callAI(extractorPrompt, message, 300, 0.2),
    callAI(chatPrompt, message, 500, 0.8),
  ]);

  // Save entities in background if extracted
  let createdItems: string[] = [];
  let entityContext = "";

  if (extractorRaw) {
    const entities = parseExtractedJSON(extractorRaw);
    if (entities?.hasEntities) {
      createdItems = await saveEntities(userId, entities);
      entityContext = buildEntityContext(entities);
    }
  }

  // If we created items, regenerate the chat response with entity context included
  if (createdItems.length > 0 && entityContext) {
    const chatPromptWithContext = CHAT_PROMPT
      .replace("{TASK_COUNT}", String(tasks.length + (createdItems.length)))
      .replace("{HIGH_URGENCY}", String(highUrgency))
      .replace("{EXPENSE_TOTAL}", expenseTotal.toLocaleString())
      .replace("{GOAL_COUNT}", String(goals.length))
      .replace("{REMINDER_COUNT}", String(reminders.length))
      .replace("{ENTITY_CONTEXT}", entityContext);

    const chatWithContext = await callAI(chatPromptWithContext, message, 500, 0.8);
    if (chatWithContext) return chatWithContext;
  }

  // Return natural chat response
  if (chatRaw) return chatRaw;

  // Fallback
  if (createdItems.length > 0) {
    return `Done! I've saved: ${createdItems.join(", ")}`;
  }

  return "I'm having trouble connecting right now. Try again in a moment.";
}
