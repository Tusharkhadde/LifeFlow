import { prisma } from "@/lib/db";

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneDate(timezone: string) {
  return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
}

function parseLocalDate(input: string, timezone: string): Date | null {
  const match = input.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{2}))?)?$/);
  if (!match || !isValidTimezone(timezone)) return null;
  const [, year, month, day, hour = "18", minute = "00"] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(new Date(localAsUtc));
  const offset = parts.find((part) => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const offsetMinutes = offset ? (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] || 0)) : 0;
  return new Date(localAsUtc - offsetMinutes * 60000);
}

function parseWhen(input: string, timezone: string): Date | null {
  const value = input.trim().toLowerCase();
  const now = getTimeZoneDate(timezone);
  if (value === "today") return parseLocalDate(`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`, timezone);
  if (value === "tomorrow") {
    now.setDate(now.getDate() + 1);
    return parseLocalDate(`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`, timezone);
  }
  const inMatch = value.match(/^in (\d+)\s+(minute|minutes|hour|hours|day|days)$/);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const unit = inMatch[2];
    const milliseconds = unit.startsWith("minute") ? amount * 60000 : unit.startsWith("hour") ? amount * 3600000 : amount * 86400000;
    return new Date(Date.now() + milliseconds);
  }
  return parseLocalDate(input, timezone);
}

export function validateTimezone(timezone: string) {
  return isValidTimezone(timezone);
}

export async function formatUserDate(userId: string, date: Date) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return date.toLocaleString("en-US", { timeZone: user?.timezone || "UTC" });
}

export async function createTask(userId: string, title: string, dueText?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const dueAt = dueText ? parseWhen(dueText, user?.timezone || "UTC") : null;
  if (dueText && !dueAt) throw new Error("I couldn't understand that task deadline.");
  return prisma.task.create({ data: { userId, title: title.trim(), dueAt } });
}

export async function createReminder(userId: string, text: string, when: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const remindAt = parseWhen(when, user?.timezone || "UTC");
  if (!remindAt) throw new Error("I couldn't understand that reminder time.");
  return prisma.reminder.create({ data: { userId, text, remindAt } });
}

export async function getDailyBriefing(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timezone = user?.timezone || "UTC";
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [tasks, reminders] = await Promise.all([
    prisma.task.findMany({ where: { userId, completed: false, OR: [{ dueAt: null }, { dueAt: { lte: tomorrow } }] }, orderBy: { dueAt: "asc" }, take: 10 }),
    prisma.reminder.findMany({ where: { userId, completed: false, remindAt: { lte: tomorrow } }, orderBy: { remindAt: "asc" }, take: 10 }),
  ]);
  const lines = ["*Your LifeFlow briefing*", ""];
  lines.push(`*Tasks:* ${tasks.length ? tasks.map((task) => `• ${task.title}${task.dueAt ? ` (${task.dueAt.toLocaleDateString("en-US", { timeZone: timezone })})` : ""}`).join("\n") : "• Nothing due soon"}`);
  lines.push(`*Reminders:* ${reminders.length ? reminders.map((reminder) => `• ${reminder.text} (${reminder.remindAt.toLocaleString("en-US", { timeZone: timezone })})`).join("\n") : "• No reminders due"}`);
  return lines.join("\n");
}

export async function getDailyInsightSummary(userId: string) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const threeDaysFromNow = new Date(now);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const [tasks, reminders, knowledgeItems] = await Promise.all([
    prisma.task.findMany({
      where: { userId, completed: false },
      orderBy: { dueAt: "asc" },
      take: 20,
    }),
    prisma.reminder.findMany({
      where: { userId, completed: false, remindAt: { gte: now, lte: threeDaysFromNow } },
      orderBy: { remindAt: "asc" },
      take: 20,
    }),
    prisma.knowledgeItem.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const dueSoonTasks = tasks.filter((task) => !task.dueAt || task.dueAt <= threeDaysFromNow).length;
  const overdueTasks = tasks.filter((task) => task.dueAt && task.dueAt < now).length;
  const activeKnowledge = knowledgeItems.length;
  const upcomingReminders = reminders.length;

  const priorities = [
    overdueTasks > 0 ? `Resolve ${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""}` : "Keep momentum on current priorities",
    dueSoonTasks > 0 ? `Complete ${dueSoonTasks} task${dueSoonTasks > 1 ? "s" : ""} due soon` : "No deadline pressure this week",
    upcomingReminders > 0 ? `Follow up on ${upcomingReminders} upcoming reminder${upcomingReminders > 1 ? "s" : ""}` : "Reminder flow is clear",
  ];

  const alerts = [] as string[];
  if (overdueTasks > 0) alerts.push("You have overdue work that should be cleared first.");
  if (upcomingReminders > 0) alerts.push("A few reminders are approaching in the next 72 hours.");
  if (activeKnowledge === 0) alerts.push("Your knowledge vault is empty; save a few links or notes to unlock memory search.");

  const nextActions = [
    "Review the most urgent task and finish the smallest high-impact action first.",
    "Use your knowledge vault to pull context before starting a new task.",
    "Schedule one focused session for deep work while the rest is blocked by quick actions.",
  ];

  const productivityScore = Math.max(35, Math.min(98, 72 + (activeKnowledge > 0 ? 8 : -10) + (overdueTasks === 0 ? 8 : -15) + (upcomingReminders > 0 ? 3 : 5)));

  const summary = [
    `You have ${tasks.length} active tasks and ${knowledgeItems.length} saved knowledge items.`,
    overdueTasks > 0
      ? `You have ${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""} needing attention.`
      : "Your task queue is healthy and moving forward.",
    upcomingReminders > 0
      ? `There are ${upcomingReminders} reminder${upcomingReminders > 1 ? "s" : ""} coming up soon.`
      : "You are currently clear on reminders for the next few days.",
  ].join(" ");

  return {
    summary,
    productivityScore: Math.round(productivityScore),
    priorities,
    alerts: alerts.length ? alerts : ["Your system looks balanced and ready for focused execution."],
    nextActions,
    stats: {
      activeTasks: tasks.length,
      overdueTasks,
      upcomingReminders,
      savedKnowledge: activeKnowledge,
      dueSoonTasks,
    },
  };
}

export async function getProductivityContext(userId: string) {
  const [tasks, reminders] = await Promise.all([
    prisma.task.findMany({
      where: { userId, completed: false },
      orderBy: { dueAt: "asc" },
      take: 15,
    }),
    prisma.reminder.findMany({
      where: { userId, completed: false },
      orderBy: { remindAt: "asc" },
      take: 15,
    }),
  ]);

  return [
    tasks.length ? `Tasks:\n${tasks.map((task) => `- ${task.title}${task.dueAt ? ` (due ${task.dueAt.toISOString()})` : ""}`).join("\n")}` : "Tasks: none",
    reminders.length ? `Reminders:\n${reminders.map((reminder) => `- ${reminder.text} (at ${reminder.remindAt.toISOString()})`).join("\n")}` : "Reminders: none",
  ].join("\n");
}
