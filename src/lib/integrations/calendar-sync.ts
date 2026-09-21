import { prisma } from "@/lib/db";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "@/lib/integrations/google-calendar";
import { getIntegration, markSynced } from "@/lib/integrations/store";

export async function syncTaskToGoogleCalendar(userId: string, taskId: string) {
  const integration = await getIntegration(userId, "google_calendar");
  if (!integration?.syncEnabled) return;

  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task || !task.dueAt || task.completed) return;

  const existing = await prisma.calendarSyncMap.findUnique({
    where: { userId_lifeflowType_lifeflowId: { userId, lifeflowType: "task", lifeflowId: taskId } },
  });

  try {
    if (existing) {
      await updateGoogleCalendarEvent(userId, existing.googleEventId, {
        summary: `📋 ${task.title}`,
        description: task.description || undefined,
        start: task.dueAt,
      });
    } else {
      const event = await createGoogleCalendarEvent(userId, {
        summary: `📋 ${task.title}`,
        description: task.description || undefined,
        start: task.dueAt,
      });
      await prisma.calendarSyncMap.create({
        data: { userId, lifeflowType: "task", lifeflowId: taskId, googleEventId: event.id },
      });
    }
  } catch (err) {
    console.warn("[CalendarSync] Task sync failed:", err);
  }
}

export async function syncReminderToGoogleCalendar(userId: string, reminderId: string) {
  const integration = await getIntegration(userId, "google_calendar");
  if (!integration?.syncEnabled) return;

  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder || reminder.completed) return;

  const existing = await prisma.calendarSyncMap.findUnique({
    where: { userId_lifeflowType_lifeflowId: { userId, lifeflowType: "reminder", lifeflowId: reminderId } },
  });

  try {
    if (existing) {
      await updateGoogleCalendarEvent(userId, existing.googleEventId, {
        summary: `🔔 ${reminder.text}`,
        start: reminder.remindAt,
        end: new Date(reminder.remindAt.getTime() + 1800000),
      });
    } else {
      const event = await createGoogleCalendarEvent(userId, {
        summary: `🔔 ${reminder.text}`,
        start: reminder.remindAt,
        end: new Date(reminder.remindAt.getTime() + 1800000),
      });
      await prisma.calendarSyncMap.create({
        data: { userId, lifeflowType: "reminder", lifeflowId: reminderId, googleEventId: event.id },
      });
    }
  } catch (err) {
    console.warn("[CalendarSync] Reminder sync failed:", err);
  }
}

export async function removeGoogleCalendarSync(userId: string, lifeflowType: string, lifeflowId: string) {
  const map = await prisma.calendarSyncMap.findUnique({
    where: { userId_lifeflowType_lifeflowId: { userId, lifeflowType, lifeflowId } },
  });
  if (!map) return;
  try {
    await deleteGoogleCalendarEvent(userId, map.googleEventId);
  } catch {
    // event may already be deleted
  }
  await prisma.calendarSyncMap.delete({ where: { id: map.id } });
}

export async function fullGoogleCalendarSync(userId: string) {
  const integration = await getIntegration(userId, "google_calendar");
  if (!integration) return { synced: 0 };

  const [tasks, reminders] = await Promise.all([
    prisma.task.findMany({ where: { userId, completed: false, dueAt: { not: null } } }),
    prisma.reminder.findMany({ where: { userId, completed: false } }),
  ]);

  for (const task of tasks) await syncTaskToGoogleCalendar(userId, task.id);
  for (const reminder of reminders) await syncReminderToGoogleCalendar(userId, reminder.id);

  await markSynced(userId, "google_calendar");
  return { synced: tasks.length + reminders.length };
}

export async function importUpcomingCalendarEvents(userId: string) {
  const { getGoogleAccessToken } = await import("@/lib/integrations/google-calendar");
  const token = await getGoogleAccessToken(userId);
  if (!token) return { imported: 0 };

  const now = new Date();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&maxResults=20&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { imported: 0 };

  const data = await res.json();
  const events = data.items || [];
  let imported = 0;

  for (const event of events) {
    const start = event.start?.dateTime || event.start?.date;
    if (!start || !event.summary) continue;

    const existing = await prisma.task.findFirst({
      where: { userId, title: event.summary, dueAt: new Date(start) },
    });
    if (existing) continue;

    await prisma.task.create({
      data: {
        userId,
        title: event.summary.replace(/^📋 |^🔔 /, ""),
        dueAt: new Date(start),
        description: event.description?.slice(0, 500),
      },
    });
    imported++;
  }

  return { imported };
}

export async function syncLifeFlowItemToIntegrations(
  userId: string,
  type: "task" | "reminder",
  id: string
) {
  if (type === "task") await syncTaskToGoogleCalendar(userId, id);
  else await syncReminderToGoogleCalendar(userId, id);
}
