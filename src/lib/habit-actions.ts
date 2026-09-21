import { prisma } from "@/lib/db";
import { publishAppEvent } from "@/lib/events";

export async function createHabit(userId: string, name: string, description?: string) {
  return prisma.habit.upsert({
    where: { userId_name: { userId, name: name.trim() } },
    create: { userId, name: name.trim(), description },
    update: { archived: false, description },
  });
}

export async function logHabit(userId: string, habitName: string, note?: string) {
  const habit = await prisma.habit.findFirst({
    where: { userId, name: { equals: habitName, mode: "insensitive" }, archived: false },
  });
  if (!habit) return null;

  const log = await prisma.habitLog.create({
    data: { userId, habitId: habit.id, note },
  });

  await publishAppEvent(userId, "habit_logged", { habitId: habit.id, name: habit.name });
  return { habit, log };
}

export function calculateStreak(logDates: Date[]): number {
  if (logDates.length === 0) return 0;
  const sorted = [...logDates].sort((a, b) => b.getTime() - a.getTime());
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sorted.length; i++) {
    const d = new Date(sorted[i]);
    d.setHours(0, 0, 0, 0);
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    if (d.getTime() === expected.getTime()) streak++;
    else if (i === 0 && d.getTime() === expected.getTime() - 86400000) streak = 1;
    else break;
  }
  return streak;
}

export async function getHabitStats(userId: string) {
  const habits = await prisma.habit.findMany({
    where: { userId, archived: false },
    include: { logs: { orderBy: { loggedAt: "desc" }, take: 60 } },
  });

  return habits.map((habit) => ({
    ...habit,
    streak: calculateStreak(habit.logs.map((l) => l.loggedAt)),
    loggedToday: habit.logs.some((l) => {
      const today = new Date();
      const d = new Date(l.loggedAt);
      return d.toDateString() === today.toDateString();
    }),
  }));
}

export function parseHabitCommand(text: string): { action: "log" | "create"; name: string } | null {
  const logMatch = text.match(/^(?:done|completed|finished|log)\s+(?:habit\s+)?["']?(.+?)["']?\.?$/i);
  if (logMatch) return { action: "log", name: logMatch[1].trim() };

  const createMatch = text.match(/^(?:track|start|add)\s+habit[:\s]+["']?(.+?)["']?\.?$/i);
  if (createMatch) return { action: "create", name: createMatch[1].trim() };

  return null;
}
