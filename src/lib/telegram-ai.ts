import { prisma } from "@/lib/db";

// ---- Model Registry ----

export interface ModelInfo {
  id: string;
  name: string;
  supportsVision: boolean;
  isFree: boolean;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "meta-llama/llama-3.2-11b-vision-instruct:free", name: "Llama 3.2 Vision 11B", supportsVision: true, isFree: true },
  { id: "qwen/qwen2-vl-7b-instruct:free", name: "Qwen2-VL 7B", supportsVision: true, isFree: true },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B", supportsVision: false, isFree: true },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", supportsVision: false, isFree: true },
  { id: "microsoft/phi-3.5-vision-instruct:free", name: "Phi-3.5 Vision", supportsVision: true, isFree: true },
];

export function getDefaultModel(): string {
  return process.env.OPENAI_MODEL || AVAILABLE_MODELS[0].id;
}

export function getDefaultVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || AVAILABLE_MODELS.find(m => m.supportsVision)?.id || getDefaultModel();
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId);
}

export function resolveVisionModel(preferredModel?: string): string {
  if (preferredModel && getModelInfo(preferredModel)?.supportsVision) return preferredModel;
  return getDefaultVisionModel();
}

// ---- Config ----

const CHAT_PROMPT = `You are LifeFlow AI, a friendly personal assistant on Telegram. Be conversational, warm, concise (2-4 sentences max). Like a knowledgeable friend, not a robot.

IMPORTANT - Today's date and time: {CURRENT_DATE}

User data: {TASK_COUNT} tasks ({HIGH_URGENCY} high), ₹{EXPENSE_TOTAL} spent, {GOAL_COUNT} goals, {REMINDER_COUNT} reminders.

{ENTITY_CONTEXT}

Always use the correct current date when answering date/time questions. Respond naturally. No JSON.`;

// ---- Types ----

interface ExtractedEntities {
  hasEntities: boolean;
  tasks: Array<{ title: string; category?: string; urgency?: string; dueDate?: string | null }>;
  expenses: Array<{ amount: number; category?: string; date?: string | null }>;
  goals: Array<{ title: string; category?: string; target?: number | null; unit?: string | null; deadline?: string | null }>;
  reminders: Array<{ title: string; datetime?: string | null; category?: string }>;
}

// ---- AI call ----

export async function callAI(systemPrompt: string, userMessage: string, maxTokens: number, temperature: number, modelOverride?: string): Promise<string | null> {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = modelOverride || process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!baseUrl || !model || !apiKey) {
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
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// ---- Local entity extraction (instant, no AI) ----

export function localExtract(message: string): ExtractedEntities | null {
  const lower = message.toLowerCase();

  // Expense: "spent ₹500 on food", "paid 200 for uber"
  const expMatch = lower.match(/(?:spent|paid|bought|cost|₹|rs\.?)\s*(\d+(?:,\d+)*)\s*(?:on|for)?\s*(\w+)?/);
  if (expMatch) {
    const amount = parseFloat(expMatch[1].replace(/,/g, ""));
    const cat = guessCat(lower);
    return { hasEntities: true, tasks: [], expenses: [{ amount, category: cat, date: null }], goals: [], reminders: [] };
  }

  // Reminder: "remind me to X", "don't forget to X", "remember to X"
  const remTrigger = lower.match(/(?:remind me(?: to)?|don't forget to|remember to|set a reminder to)/);
  if (remTrigger) {
    const after = lower.slice(remTrigger.index! + remTrigger[0].length).trim();
    const before = lower.slice(0, remTrigger.index!).trim();
    const sourceText = after && !after.match(/^(at|on|by|tomorrow|today|next week)\b/) ? after : before || after;
    const title = cleanupReminderTitle(sourceText || lower);
    return {
      hasEntities: true,
      tasks: [],
      expenses: [],
      goals: [],
      reminders: [{ title, datetime: parseDate(lower), category: "general" }],
    };
  }

  // Automatic due-date reminder creation from direct due statements
  const dueStatement = lower.match(/(?:due date is|due on|due by|bill due|is due|due tomorrow|due today|due next week)\b/);
  if (dueStatement) {
    const titleText = lower.replace(/(?:due date is|due on|due by|bill due|is due|due tomorrow|due today|due next week).*/g, "").trim();
    const title = cap(cleanupReminderTitle(titleText || "Reminder"));
    return {
      hasEntities: true,
      tasks: [],
      expenses: [],
      goals: [],
      reminders: [{ title, datetime: parseDate(lower), category: "general" }],
    };
  }

  // Task: "need to X", "have to X", "todo: X"
  const taskMatch = lower.match(/(?:need to|have to|must|todo:?|task:?|i should|i gotta)\s+(.+)/);
  if (taskMatch || (lower.includes(" by ") && !lower.includes("save"))) {
    const title = cap((taskMatch?.[1] || message).replace(/tomorrow|today|next week|by \w+/g, "").trim());
    const urgency = lower.includes("urgent") || lower.includes("asap") || lower.includes("important") ? "high" : "normal";
    return { hasEntities: true, tasks: [{ title, category: "general", urgency, dueDate: dueDate(lower) }], expenses: [], goals: [], reminders: [] };
  }

  // Goal: "save ₹50k for trip"
  const goalMatch = lower.match(/(?:save|goal|target)\s+(?:₹|rs\.?)?\s*(\d+(?:,\d+)*)\s*(?:for|towards)\s+(.+)/);
  if (goalMatch) {
    const target = parseFloat(goalMatch[1].replace(/,/g, ""));
    const title = cap(goalMatch[2].trim());
    return { hasEntities: true, tasks: [], expenses: [], goals: [{ title, category: "personal", target, unit: "rupees", deadline: null }], reminders: [] };
  }

  return null;
}

function guessCat(t: string): string {
  if (t.match(/food|grocer|dinner|lunch|breakfast|meal|restaurant/)) return "food";
  if (t.match(/transport|uber|ola|taxi|petrol|fuel/)) return "transport";
  if (t.match(/subscription|netflix|spotify|prime/)) return "subscriptions";
  if (t.match(/electric|bill|water|internet|recharge/)) return "utilities";
  if (t.match(/shop|clothes|shoes|amazon/)) return "shopping";
  if (t.match(/doctor|medicine|hospital|gym/)) return "health";
  if (t.match(/book|course|class|tuition/)) return "education";
  return "other";
}

export function parseDate(t: string): string {
  const now = new Date();
  const lower = t.toLowerCase();
  const date = new Date(now.getTime());

  if (lower.includes("day after tomorrow")) date.setDate(date.getDate() + 2);
  else if (lower.includes("tomorrow")) date.setDate(date.getDate() + 1);
  else if (lower.includes("next week")) date.setDate(date.getDate() + 7);
  else if (lower.includes("today")) {
    // keep today
  } else {
    const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const monthMatch = lower.match(new RegExp(`(?:on\s+)?(${months.join("|")})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?`));
    if (monthMatch) {
      const monthIndex = months.indexOf(monthMatch[1]);
      const day = parseInt(monthMatch[2], 10);
      const year = monthMatch[3] ? parseInt(monthMatch[3], 10) : date.getFullYear();
      date.setFullYear(year, monthIndex, day);
    } else {
      const numericMatch = lower.match(/(?:on\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (numericMatch) {
        const day = parseInt(numericMatch[1], 10);
        const month = parseInt(numericMatch[2], 10) - 1;
        const year = numericMatch[3] ? parseInt(numericMatch[3], 10) : date.getFullYear();
        date.setFullYear(year, month, day);
      }
    }
  }

  const timeM = lower.match(/(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeM) {
    let h = parseInt(timeM[1], 10);
    const m = parseInt(timeM[2] || "0", 10);
    if (timeM[3] === "pm" && h < 12) h += 12;
    if (timeM[3] === "am" && h === 12) h = 0;
    date.setHours(h, m, 0, 0);
  } else if (lower.includes("noon")) {
    date.setHours(12, 0, 0, 0);
  } else if (lower.includes("midnight")) {
    date.setHours(0, 0, 0, 0);
  } else if (lower.includes("evening") || lower.includes("night")) {
    date.setHours(18, 0, 0, 0);
  } else if (lower.includes("morning")) {
    date.setHours(9, 0, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function dueDate(t: string): string | null {
  const lower = t.toLowerCase();
  const now = new Date();
  const date = new Date(now.getTime());
  let foundDate = false;

  if (lower.includes("day after tomorrow")) {
    date.setDate(date.getDate() + 2);
    foundDate = true;
  } else if (lower.includes("tomorrow")) {
    date.setDate(date.getDate() + 1);
    foundDate = true;
  } else if (lower.includes("next week")) {
    date.setDate(date.getDate() + 7);
    foundDate = true;
  } else if (lower.includes("today")) {
    foundDate = true;
  } else {
    const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const monthMatch = lower.match(new RegExp(`(?:on\s+)?(${months.join("|")})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?`));
    if (monthMatch) {
      const monthIndex = months.indexOf(monthMatch[1]);
      const day = parseInt(monthMatch[2], 10);
      const year = monthMatch[3] ? parseInt(monthMatch[3], 10) : date.getFullYear();
      date.setFullYear(year, monthIndex, day);
      foundDate = true;
    } else {
      const numericMatch = lower.match(/(?:on\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (numericMatch) {
        const day = parseInt(numericMatch[1], 10);
        const month = parseInt(numericMatch[2], 10) - 1;
        const year = numericMatch[3] ? parseInt(numericMatch[3], 10) : date.getFullYear();
        date.setFullYear(year, month, day);
        foundDate = true;
      }
    }
  }

  return foundDate ? date.toISOString().split("T")[0] : null;
}

export function cleanupReminderTitle(text: string): string {
  return text
    .replace(/\b(on|at|by|due|tomorrow|today|next week|this morning|this evening|this night|tonight)\b.*$/i, "")
    .replace(/[.,!?]+$/, "")
    .trim();
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---- Local chat fallback ----

function localChat(msg: string, tasks: number, spent: number, goals: number): string {
  const l = msg.toLowerCase();
  if (l.match(/^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening))/)) return "Hey! What's up? I can help with tasks, expenses, goals, or just chat.";
  if (l.match(/how\s+(are|r)\s+you/)) return "I'm great, thanks! All your data is organized. How can I help?";
  if (l.includes("joke")) {
    const j = ["Why don't scientists trust atoms? They make up everything!","Why did the scarecrow win an award? Outstanding in his field!","I'm reading a book on anti-gravity — impossible to put down!"];
    return j[Math.floor(Math.random() * j.length)];
  }
  if (l.match(/thank|thanks/)) return "You're welcome! Anything else?";
  if (l.match(/bye|goodbye|good\s+night/)) return "See you later!";
  return `You have ${tasks} tasks, ₹${spent.toLocaleString()} spent, ${goals} goals. Ask me anything!`;
}

// ---- Save entities to DB ----

async function saveEntities(userId: string, e: ExtractedEntities, existingReminders: Array<{ title: string; datetime: Date }>, existingTasks: Array<{ title: string; dueDate: Date | null }>): Promise<{ created: string[]; relatedReminders: string[]; relatedTasks: string[] }> {
  const created: string[] = [];
  const relatedReminders: string[] = [];
  const relatedTasks: string[] = [];

  for (const t of e.tasks || []) {
    await prisma.task.create({ data: { userId, title: t.title, category: t.category || "general", urgency: t.urgency || "normal", dueDate: t.dueDate ? new Date(t.dueDate) : null } });
    created.push(t.title);

    // Check for similar existing tasks
    const lower = t.title.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 3);
    for (const existing of existingTasks) {
      const exLower = existing.title.toLowerCase();
      const isSimilar = words.some((w) => exLower.includes(w)) && exLower !== lower;
      if (isSimilar && !relatedTasks.includes(existing.title)) {
        relatedTasks.push(existing.title);
      }
    }
  }

  for (const x of e.expenses || []) {
    await prisma.expense.create({ data: { userId, amount: x.amount, category: x.category || "other", date: x.date ? new Date(x.date) : new Date(), source: "telegram" } });
    created.push(`₹${x.amount} ${x.category || "expense"}`);
  }

  for (const g of e.goals || []) {
    await prisma.goal.create({ data: { userId, title: g.title, category: g.category || "personal", target: g.target || null, current: 0, unit: g.unit || null, deadline: g.deadline ? new Date(g.deadline) : null } });
    created.push(g.title);
  }

  for (const r of e.reminders || []) {
    await prisma.reminder.create({ data: { userId, title: r.title, datetime: r.datetime ? new Date(r.datetime) : new Date(), category: r.category || "general" } });
    created.push(r.title);

    // Check for similar existing reminders
    const lower = r.title.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 3);
    for (const existing of existingReminders) {
      const exLower = existing.title.toLowerCase();
      const isSimilar = words.some((w) => exLower.includes(w)) && exLower !== lower;
      if (isSimilar && !relatedReminders.includes(existing.title)) {
        relatedReminders.push(existing.title);
      }
    }
  }

  return { created, relatedReminders, relatedTasks };
}

// ---- Main handler ----

export async function handleMessage(message: string, userId: string, modelOverride?: string): Promise<string> {
  const now = new Date();

  const [tasks, expenses, goals, reminders] = await Promise.all([
    prisma.task.findMany({ where: { userId, completed: false } }),
    prisma.expense.findMany({ where: { userId, date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
    prisma.goal.findMany({ where: { userId, completed: false } }),
    prisma.reminder.findMany({ where: { userId, completed: false } }),
  ]);

  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const highUrgency = tasks.filter((t) => t.urgency === "high").length;

  // STEP 1: Try local extraction first (instant, 0ms)
  const localEntities = localExtract(message);
  if (localEntities?.hasEntities) {
    const result = await saveEntities(userId, localEntities, reminders, tasks);
    if (result.created.length > 0) {
      const assistantReplies: string[] = [];

      if (localEntities.reminders.length > 0) {
        for (const reminder of localEntities.reminders) {
          const when = reminder.datetime
            ? new Date(reminder.datetime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
            : "soon";
          assistantReplies.push(`Got it. I set a reminder for ${reminder.title} on ${when}.`);
        }
      }

      if (localEntities.tasks.length > 0) {
        const taskTitles = localEntities.tasks.map((t) => t.title).join(", ");
        assistantReplies.push(`Done — I added your task${localEntities.tasks.length > 1 ? "s" : ""}: ${taskTitles}.`);
      }

      if (localEntities.expenses.length > 0) {
        const expenseTotals = localEntities.expenses.map((e) => `₹${e.amount.toLocaleString()}`).join(", ");
        const expenseLabel = localEntities.expenses.length > 1 ? "expenses" : "expense";
        assistantReplies.push(`Logged your ${expenseLabel}: ${expenseTotals}.`);
      }

      if (localEntities.goals.length > 0) {
        const goalTitles = localEntities.goals.map((g) => g.title).join(", ");
        const goalLabel = localEntities.goals.length > 1 ? "goals" : "goal";
        assistantReplies.push(`Nice! I saved your ${goalLabel}: ${goalTitles}.`);
      }

      if (result.relatedReminders.length > 0) {
        assistantReplies.push(`FYI, you also have similar reminders: ${result.relatedReminders.join(", ")}.`);
      }

      if (result.relatedTasks.length > 0) {
        assistantReplies.push(`I found similar tasks already on your list: ${result.relatedTasks.join(", ")}.`);
      }

      assistantReplies.push("Anything else I can help with?");
      return assistantReplies.join(" ");
    }
  }

  // STEP 2: Only call AI for chat responses (1 call max)
  const now2 = new Date();
  const currentDate = now2.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + ", " + now2.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const chatPrompt = CHAT_PROMPT
    .replace("{CURRENT_DATE}", currentDate)
    .replace("{TASK_COUNT}", String(tasks.length))
    .replace("{HIGH_URGENCY}", String(highUrgency))
    .replace("{EXPENSE_TOTAL}", expenseTotal.toLocaleString())
    .replace("{GOAL_COUNT}", String(goals.length))
    .replace("{REMINDER_COUNT}", String(reminders.length))
    .replace("{ENTITY_CONTEXT}", "");

  const chatResponse = await callAI(chatPrompt, message, 300, 0.8, modelOverride);
  if (chatResponse) return chatResponse;

  // STEP 3: AI failed — local chat fallback
  return localChat(message, tasks.length, expenseTotal, goals.length);
}

// ---- Document/Image Analysis ----

export interface DocumentAnalysis {
  type: string;
  name: string;
  category: string;
  issueDate: string | null;
  expiryDate: string | null;
  otherDates: Array<{ label: string; date: string }>;
  keyInfo: Record<string, string>;
  confidence: number;
}

async function callVisionAI(imageBase64: string, mimeType: string, caption?: string, modelOverride?: string): Promise<string | null> {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = modelOverride || resolveVisionModel(process.env.OPENAI_MODEL);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!baseUrl || !model || !apiKey) {
    return null;
  }

  const prompt = caption
    ? `Analyze this document/image. User says: "${caption}". Extract: document type, name/title, issue date, expiry date, any other important dates, and key information (amounts, names, IDs, etc.). Respond in JSON format only: { "type": string, "name": string, "category": string, "issueDate": string|null, "expiryDate": string|null, "otherDates": [{ "label": string, "date": string }], "keyInfo": {string: string}, "confidence": number }. Use null for missing dates.`
    : `Analyze this document/image. Extract: document type, name/title, issue date, expiry date, any other important dates, and key information (amounts, names, IDs, etc.). Respond in JSON format only: { "type": string, "name": string, "category": string, "issueDate": string|null, "expiryDate": string|null, "otherDates": [{ "label": string, "date": string }], "keyInfo": {string: string}, "confidence": number }. Use null for missing dates.`;

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
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function analyzeDocumentImage(imageBase64: string, mimeType: string, caption?: string, modelOverride?: string): Promise<DocumentAnalysis | null> {
  const raw = await callVisionAI(imageBase64, mimeType, caption, modelOverride);
  if (!raw) return null;

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    return {
      type: parsed.type || "unknown",
      name: parsed.name || "Unnamed Document",
      category: parsed.category || "uncategorized",
      issueDate: parsed.issueDate || null,
      expiryDate: parsed.expiryDate || null,
      otherDates: parsed.otherDates || [],
      keyInfo: parsed.keyInfo || {},
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return null;
  }
}

const telegramAI = {
  localExtract,
  parseDate,
  dueDate,
  cleanupReminderTitle,
  analyzeDocumentImage,
  handleMessage,
  getDefaultModel,
  getDefaultVisionModel,
  getModelInfo,
  resolveVisionModel,
  callAI,
  AVAILABLE_MODELS,
};

export default telegramAI;
