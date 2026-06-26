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
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!baseUrl || !model || !apiKey) {
    console.error("[telegram-ai] Missing env vars:", {
      baseUrl: !!baseUrl,
      model: !!model,
      apiKey: !!apiKey,
    });
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow AI",
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

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[telegram-ai] API error ${response.status}:`, errBody);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[telegram-ai] API call failed:", err);
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

// ---- Local fallback when AI is down ----

function localExtractEntities(message: string): ExtractedEntities | null {
  const lower = message.toLowerCase();

  // Detect expenses: "spent ₹500 on food", "₹500 groceries", "paid 200 for transport"
  const expenseMatch = lower.match(/(?:spent|paid|bought|cost|price|₹|rs\.?|inr)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:on|for)?\s*(\w+)?/);
  if (expenseMatch) {
    const amount = parseFloat(expenseMatch[1].replace(/,/g, ""));
    const desc = expenseMatch[2] || message;
    const category = guessExpenseCategory(lower);
    return {
      hasEntities: true,
      tasks: [],
      expenses: [{ amount, category, description: desc, date: null }],
      goals: [],
      reminders: [],
    };
  }

  // Detect reminders: "remind me to X at Y", "don't forget to X"
  const reminderMatch = lower.match(/(?:remind me to|don't forget to|remember to|set reminder)\s+(.+)/);
  if (reminderMatch) {
    const title = capitalize(reminderMatch[1].replace(/tomorrow|today|next week|next month/g, "").trim());
    const datetime = parseRelativeDate(lower);
    return {
      hasEntities: true,
      tasks: [],
      expenses: [],
      goals: [],
      reminders: [{ title, description: null, datetime, category: "general" }],
    };
  }

  // Detect tasks: "I need to X by Y", "have to X", "must X", "todo: X"
  const taskMatch = lower.match(/(?:need to|have to|must|todo:?|task:?|i should|i gotta|i gotta)\s+(.+)/);
  if (taskMatch || lower.includes(" by ")) {
    const title = capitalize((taskMatch?.[1] || message).replace(/tomorrow|today|next week|next month|by \w+/g, "").trim());
    const urgency = lower.includes("urgent") || lower.includes("asap") || lower.includes("important") ? "high" : "normal";
    const dueDate = extractDueDate(lower);
    return {
      hasEntities: true,
      tasks: [{ title, description: null, category: "general", urgency, dueDate }],
      expenses: [],
      goals: [],
      reminders: [],
    };
  }

  // Detect goals: "save X for Y", "goal: X", "target X"
  const goalMatch = lower.match(/(?:save|goal|target|aim)\s+(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)\s*(?:for|towards?)\s+(.+)/);
  if (goalMatch) {
    const target = parseFloat(goalMatch[1].replace(/,/g, ""));
    const title = capitalize(goalMatch[2].trim());
    return {
      hasEntities: true,
      tasks: [],
      expenses: [],
      goals: [{ title, description: null, category: "personal", target, unit: "rupees", deadline: null }],
      reminders: [],
    };
  }

  return null;
}

function guessExpenseCategory(text: string): string {
  if (text.includes("food") || text.includes("grocer") || text.includes("dinner") || text.includes("lunch") || text.includes("breakfast") || text.includes("meal") || text.includes("restaurant")) return "food";
  if (text.includes("transport") || text.includes("uber") || text.includes("ola") || text.includes("taxi") || text.includes("petrol") || text.includes("fuel")) return "transport";
  if (text.includes("subscription") || text.includes("netflix") || text.includes("spotify") || text.includes("prime")) return "subscriptions";
  if (text.includes("electric") || text.includes("bill") || text.includes("water") || text.includes("internet") || text.includes("recharge")) return "utilities";
  if (text.includes("shop") || text.includes("clothes") || text.includes("shoes") || text.includes("amazon")) return "shopping";
  if (text.includes("doctor") || text.includes("medicine") || text.includes("hospital") || text.includes("gym")) return "health";
  if (text.includes("book") || text.includes("course") || text.includes("class") || text.includes("tuition")) return "education";
  return "other";
}

function parseRelativeDate(text: string): string {
  const now = new Date();
  if (text.includes("tomorrow")) {
    now.setDate(now.getDate() + 1);
  } else if (text.includes("next week")) {
    now.setDate(now.getDate() + 7);
  } else if (text.includes("next month")) {
    now.setMonth(now.getMonth() + 1);
  }

  // Try to extract time: "at 5pm", "at 5:30", "at 17:00"
  const timeMatch = text.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] || "0");
    const ampm = timeMatch[3];
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    now.setHours(hours, minutes, 0, 0);
  } else {
    now.setHours(9, 0, 0, 0); // Default to 9 AM
  }

  return now.toISOString().replace("Z", "").split(".")[0];
}

function extractDueDate(text: string): string | null {
  const now = new Date();
  if (text.includes("today")) {
    return now.toISOString().split("T")[0];
  }
  if (text.includes("tomorrow")) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
  }
  if (text.includes("next week")) {
    now.setDate(now.getDate() + 7);
    return now.toISOString().split("T")[0];
  }
  if (text.includes("next month")) {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString().split("T")[0];
  }

  // Try to extract "by April 15th" or "by 15 april"
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (let i = 0; i < monthNames.length; i++) {
    if (text.includes(monthNames[i])) {
      const dayMatch = text.match(new RegExp(`${monthNames[i]}\\s+(\\d{1,2})`)) ||
                       text.match(new RegExp(`(\\d{1,2})\\s+${monthNames[i]}`));
      if (dayMatch) {
        const day = parseInt(dayMatch[1]);
        const date = new Date(now.getFullYear(), i, day);
        if (date < now) date.setFullYear(date.getFullYear() + 1);
        return date.toISOString().split("T")[0];
      }
    }
  }

  return null;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function localChatResponse(message: string, taskCount: number, expenseTotal: number, goalCount: number): string {
  const lower = message.toLowerCase();

  if (lower.match(/(?:hi|hello|hey|howdy|good\s*(morning|afternoon|evening))/)) {
    return "Hey there! What's up? I can help you with tasks, expenses, goals, or just chat. What's on your mind?";
  }

  if (lower.match(/how\s+(are|r)\s+you|how('?s|\s+is)\s+it\s+going/)) {
    return "I'm doing great, thanks for asking! All your life data is organized and ready. How can I help you today?";
  }

  if (lower.includes("joke")) {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "I told my wife she was drawing her eyebrows too high. She looked surprised.",
      "Why did the scarecrow win an award? He was outstanding in his field!",
      "I'm reading a book about anti-gravity. It's impossible to put down!",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  if (lower.match(/what'?s?\s+the\s+news|current\s+events|what'?s?\s+happening/)) {
    return "I don't have real-time news access, but I can tell you what's happening in your life! You have " + taskCount + " pending tasks, ₹" + expenseTotal.toLocaleString() + " spent this month, and " + goalCount + " active goals. Want details on any of these?";
  }

  if (lower.match(/thank|thanks|thx/)) {
    return "You're welcome! Anything else I can help with?";
  }

  if (lower.match(/bye|goodbye|see\s+ya|good\s+night/)) {
    return "See you later! Take care!";
  }

  // Generic response
  return "I hear you! I can help with your tasks, expenses, goals, and reminders — or just chat. What would you like to do?";
}

// ---- End local fallback ----

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

  // Save entities in background if extracted (AI or local)
  let createdItems: string[] = [];
  let entityContext = "";

  if (extractorRaw) {
    const entities = parseExtractedJSON(extractorRaw);
    if (entities?.hasEntities) {
      createdItems = await saveEntities(userId, entities);
      entityContext = buildEntityContext(entities);
    }
  } else {
    // AI failed — use local fallback for entity extraction
    const localEntities = localExtractEntities(message);
    if (localEntities?.hasEntities) {
      createdItems = await saveEntities(userId, localEntities);
      entityContext = buildEntityContext(localEntities);
    }
  }

  // If we created items, try to get AI to acknowledge them naturally
  if (createdItems.length > 0 && entityContext) {
    const chatPromptWithContext = CHAT_PROMPT
      .replace("{TASK_COUNT}", String(tasks.length + createdItems.length))
      .replace("{HIGH_URGENCY}", String(highUrgency))
      .replace("{EXPENSE_TOTAL}", expenseTotal.toLocaleString())
      .replace("{GOAL_COUNT}", String(goals.length))
      .replace("{REMINDER_COUNT}", String(reminders.length))
      .replace("{ENTITY_CONTEXT}", entityContext);

    const chatWithContext = await callAI(chatPromptWithContext, message, 500, 0.8);
    if (chatWithContext) return chatWithContext;

    // AI failed for response — give natural local confirmation
    const items = createdItems.join(", ");
    return `Done! Saved: ${items}. What else can I help with?`;
  }

  // Return natural AI chat response
  if (chatRaw) return chatRaw;

  // AI completely failed — use local chat fallback
  return localChatResponse(message, tasks.length, expenseTotal, goals.length);
}
