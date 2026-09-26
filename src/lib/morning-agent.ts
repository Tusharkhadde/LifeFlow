import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { getPersonaPrompt } from "@/lib/personas";
import { getCommandCenter } from "@/lib/command-center";
import { getUpcomingBills } from "@/lib/bill-autopilot";
import { listTodayCalendarEvents } from "@/lib/integrations/google-calendar";
import { getPersonalMemoryContext } from "@/lib/personal-memory";
import { syncLifeFlowItemToIntegrations } from "@/lib/integrations/calendar-sync";
import { publishAppEvent } from "@/lib/events";
import { generateSpeechFromText } from "@/lib/voice-briefing";
import { sendTelegramMessage, sendTelegramVoice } from "@/lib/telegram";

export interface MorningPriority {
  title: string;
  reason: string;
  minutes: number;
  startAt: string;
  taskId?: string;
  calendarSynced: boolean;
  reused: boolean;
}

export interface MorningRunResult {
  ranAt: string;
  reused: boolean;
  briefing: string;
  telegram: string;
  watchouts: string[];
  habits: string[];
  priorities: MorningPriority[];
  calendarConnected: boolean;
  todayEvents: Array<{ summary: string; start: string }>;
}

const MORNING_EVENT = "morning_run" as const;

function startOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function roundToNextBlock(date: Date) {
  const next = new Date(date.getTime() + 15 * 60000);
  next.setMinutes(next.getMinutes() < 30 ? 0 : 30, 0, 0);
  if (next <= date) next.setMinutes(next.getMinutes() + 30);
  return next;
}

export async function getTodayMorningRun(userId: string): Promise<MorningRunResult | null> {
  const event = await prisma.appEvent.findFirst({
    where: { userId, type: MORNING_EVENT, createdAt: { gte: startOfDay() } },
    orderBy: { createdAt: "desc" },
  });
  if (!event) return null;
  return event.payload as unknown as MorningRunResult;
}

async function planWithFallback(userId: string): Promise<Omit<MorningRunResult, "ranAt" | "reused" | "priorities" | "calendarConnected" | "todayEvents"> & { draft: Array<{ title: string; reason: string; minutes: number }> }> {
  const [overview, bills, memory] = await Promise.all([
    getCommandCenter(userId),
    getUpcomingBills(userId).catch(() => []),
    getPersonalMemoryContext(userId).catch(() => ""),
  ]);

  const draft: Array<{ title: string; reason: string; minutes: number }> = [];
  const overdue = overview.tasks.overdue[0];
  if (overdue) draft.push({ title: overdue.title, reason: "Overdue — clear this first so the rest of the day is unblocked.", minutes: 45 });

  const due = overview.tasks.dueToday.find((task) => task.title !== overdue?.title) || overview.tasks.upcoming.find((task) => task.title !== overdue?.title);
  if (due) draft.push({ title: due.title, reason: "Already on your list and due soon.", minutes: 60 });

  const staleHabit = overview.habits.find((habit) => !habit.loggedToday);
  if (staleHabit && draft.length < 3) {
    draft.push({ title: `Log habit: ${staleHabit.name}`, reason: `Protect the ${staleHabit.streak}d streak.`, minutes: 20 });
  }

  const bill = bills[0];
  if (bill && draft.length < 3) {
    draft.push({ title: `Pay ${bill.name}`, reason: `₹${Math.round(bill.amount)} coming due.`, minutes: 25 });
  }

  if (draft.length < 3) {
    draft.push({ title: "Deep work block", reason: "Protect 60 minutes before context switching.", minutes: 60 });
  }

  const watchouts = [
    ...overview.alerts.slice(0, 3).map((alert) => alert.message),
    ...(overview.expenses.alerts || []).slice(0, 1),
  ].filter(Boolean);

  const briefing = [
    `Focus score ${overview.insights.productivityScore}/100.`,
    overview.insights.summary,
    draft.length ? `Top move: ${draft[0].title}.` : "Your queue is light — use the open time for deep work.",
  ].join(" ");

  const telegram = [
    "*☀️ Morning OS*",
    "",
    briefing,
    "",
    "*Focus blocks:*",
    ...draft.slice(0, 3).map((item, index) => `${index + 1}. *${item.title}* — ${item.reason}`),
    watchouts.length ? `\n*Watchouts:*\n${watchouts.map((item) => `• ${item}`).join("\n")}` : "",
    memory ? `\n_Remembered: ${memory.split("\n")[0]}_` : "",
  ].join("\n");

  return {
    briefing,
    telegram,
    watchouts,
    habits: overview.habits.filter((habit) => !habit.loggedToday).map((habit) => habit.name),
    draft: draft.slice(0, 3),
  };
}

async function planWithLLM(userId: string, todayEvents: Array<{ summary: string; start: string }>) {
  const config = getAIConfig();
  if (!config) return null;

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const persona = getPersonaPrompt(settings?.aiPersona || "assistant");
  const fallback = await planWithFallback(userId);

  const prompt = `${persona}

Plan this user's morning as a personal operating system. Return JSON only:
{
  "briefing": "60-second spoken briefing, no markdown",
  "telegram": "short Telegram markdown briefing",
  "watchouts": ["risk 1"],
  "habits": ["habit to log today"],
  "priorities": [{"title":"short task","reason":"why now","minutes":45}]
}

Rules:
- Exactly 3 priorities, concrete and doable today.
- Prefer existing overdue/due tasks over inventing new busywork.
- Avoid duplicating calendar events already happening today.
- Keep titles under 80 characters.

Context:
${fallback.telegram}
Calendar today: ${todayEvents.map((event) => `${event.summary} @ ${event.start}`).join("; ") || "none"}`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      briefing?: string;
      telegram?: string;
      watchouts?: string[];
      habits?: string[];
      priorities?: Array<{ title?: string; reason?: string; minutes?: number }>;
    };
    const draft = (parsed.priorities || [])
      .filter((item) => item.title)
      .slice(0, 3)
      .map((item) => ({
        title: String(item.title).slice(0, 80),
        reason: String(item.reason || "Morning OS priority"),
        minutes: Math.min(120, Math.max(20, Number(item.minutes) || 45)),
      }));
    if (draft.length === 0) return null;
    return {
      briefing: parsed.briefing || fallback.briefing,
      telegram: parsed.telegram || fallback.telegram,
      watchouts: parsed.watchouts || fallback.watchouts,
      habits: parsed.habits || fallback.habits,
      draft,
    };
  } catch {
    return null;
  }
}

export async function runMorningAgent(
  userId: string,
  options: { force?: boolean; notifyTelegram?: boolean } = {}
): Promise<MorningRunResult> {
  if (!options.force) {
    const existing = await getTodayMorningRun(userId);
    if (existing) return { ...existing, reused: true };
  }

  const todayEvents = await listTodayCalendarEvents(userId).catch(() => []);
  const planned = (await planWithLLM(userId, todayEvents)) || (await planWithFallback(userId));
  const calendarConnected = todayEvents.length > 0 || Boolean(await prisma.integration.findFirst({
    where: { userId, provider: "google_calendar", syncEnabled: true },
  }));

  let cursor = roundToNextBlock(new Date());
  const priorities: MorningPriority[] = [];

  for (const item of planned.draft) {
    const startAt = new Date(cursor);
    const existing = await prisma.task.findFirst({
      where: {
        userId,
        completed: false,
        title: item.title,
        createdAt: { gte: startOfDay() },
      },
    });

    let task = existing;
    if (!task) {
      task = await prisma.task.create({
        data: {
          userId,
          title: item.title,
          description: `Morning OS · ${item.reason}`,
          dueAt: startAt,
        },
      });
      await publishAppEvent(userId, "task_created", { id: task.id, title: task.title });
    } else if (!task.dueAt) {
      await prisma.task.update({ where: { id: task.id }, data: { dueAt: startAt } });
    }

    let calendarSynced = false;
    try {
      await syncLifeFlowItemToIntegrations(userId, "task", task.id);
      calendarSynced = calendarConnected;
    } catch {
      calendarSynced = false;
    }

    priorities.push({
      title: item.title,
      reason: item.reason,
      minutes: item.minutes,
      startAt: startAt.toISOString(),
      taskId: task.id,
      calendarSynced,
      reused: Boolean(existing),
    });

    cursor = new Date(startAt.getTime() + item.minutes * 60000);
  }

  const result: MorningRunResult = {
    ranAt: new Date().toISOString(),
    reused: false,
    briefing: planned.briefing,
    telegram: planned.telegram,
    watchouts: planned.watchouts,
    habits: planned.habits,
    priorities,
    calendarConnected,
    todayEvents,
  };

  await publishAppEvent(userId, MORNING_EVENT, result as unknown as Record<string, unknown>);

  if (options.notifyTelegram) {
    const link = await prisma.telegramLink.findFirst({ where: { userId } });
    if (link?.telegramChatId) {
      const chatId = Number(link.telegramChatId);
      await sendTelegramMessage(chatId, result.telegram);
      const audio = await generateSpeechFromText(result.briefing);
      if (audio) await sendTelegramVoice(chatId, audio, "Morning OS briefing");
    }
  }

  return result;
}
