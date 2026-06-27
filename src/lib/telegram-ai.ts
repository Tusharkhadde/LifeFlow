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

async function callAI(systemPrompt: string, userMessage: string, maxTokens: number, temperature: number, modelOverride?: string): Promise<string | null> {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = modelOverride || process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!baseUrl || !model || !apiKey) {
    console.error("[telegram-ai] Missing env vars");
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
      console.error(`[telegram-ai] API ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[telegram-ai] API failed:", err);
    return null;
  }
}

// ---- Local entity extraction (instant, no AI) ----

function localExtract(message: string): ExtractedEntities | null {
  const lower = message.toLowerCase();

  // Expense: "spent ₹500 on food", "paid 200 for uber"
  const expMatch = lower.match(/(?:spent|paid|bought|cost|₹|rs\.?)\s*(\d+(?:,\d+)*)\s*(?:on|for)?\s*(\w+)?/);
  if (expMatch) {
    const amount = parseFloat(expMatch[1].replace(/,/g, ""));
    const cat = guessCat(lower);
    return { hasEntities: true, tasks: [], expenses: [{ amount, category: cat, date: null }], goals: [], reminders: [] };
  }

  // Reminder: "remind me to X", "don't forget to X"
  const remMatch = lower.match(/(?:remind me to|don't forget to|remember to)\s+(.+)/);
  if (remMatch) {
    const title = cap(remMatch[1].replace(/tomorrow|today|next week/g, "").trim());
    return { hasEntities: true, tasks: [], expenses: [], goals: [], reminders: [{ title, datetime: parseDate(lower), category: "general" }] };
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

function parseDate(t: string): string {
  const now = new Date();
  if (t.includes("tomorrow")) now.setDate(now.getDate() + 1);
  else if (t.includes("next week")) now.setDate(now.getDate() + 7);
  const timeM = t.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeM) {
    let h = parseInt(timeM[1]);
    const m = parseInt(timeM[2] || "0");
    if (timeM[3] === "pm" && h < 12) h += 12;
    if (timeM[3] === "am" && h === 12) h = 0;
    now.setHours(h, m, 0, 0);
  } else {
    now.setHours(9, 0, 0, 0);
  }
  return now.toISOString().replace("Z", "").split(".")[0];
}

function dueDate(t: string): string | null {
  const now = new Date();
  if (t.includes("today")) return now.toISOString().split("T")[0];
  if (t.includes("tomorrow")) { now.setDate(now.getDate() + 1); return now.toISOString().split("T")[0]; }
  if (t.includes("next week")) { now.setDate(now.getDate() + 7); return now.toISOString().split("T")[0]; }
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  for (let i = 0; i < months.length; i++) {
    if (t.includes(months[i])) {
      const dm = t.match(new RegExp(`${months[i]}\\s+(\\d{1,2})`)) || t.match(new RegExp(`(\\d{1,2})\\s+${months[i]}`));
      if (dm) {
        const d = new Date(now.getFullYear(), i, parseInt(dm[1]));
        if (d < now) d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split("T")[0];
      }
    }
  }
  return null;
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
      let response = `Done! Saved: ${result.created.join(", ")}`;

      // Warn about similar existing reminders
      if (result.relatedReminders.length > 0) {
        response += `\n\nYou also have similar reminders:\n${result.relatedReminders.map((r) => `- ${r}`).join("\n")}`;
      }

      // Warn about similar existing tasks
      if (result.relatedTasks.length > 0) {
        response += `\n\nRelated tasks you already have:\n${result.relatedTasks.map((t) => `- ${t}`).join("\n")}`;
      }

      // Show all pending reminders if user just added one
      if (localEntities.reminders.length > 0 && reminders.length > 0) {
        const upcoming = reminders
          .slice(0, 5)
          .map((r) => `- ${r.title} (${new Date(r.datetime).toLocaleDateString()})`)
          .join("\n");
        response += `\n\nAll your pending reminders:\n${upcoming}`;
      }

      response += "\n\nWhat else?";
      return response;
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
    console.error("[telegram-ai] Missing env vars for vision");
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
      console.error(`[telegram-ai] Vision API ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[telegram-ai] Vision API failed:", err);
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
    console.error("[telegram-ai] Failed to parse vision response:", raw);
    return null;
  }
}
