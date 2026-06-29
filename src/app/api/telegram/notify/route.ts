import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

// GET /api/telegram/notify — called by Vercel cron
// Sends a unified daily summary to all linked Telegram users
export async function GET(request: Request) {
  // Verify this is a Vercel cron request (or allow manual trigger with secret)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  // Find all linked users
  const links = await prisma.telegramLink.findMany({
    include: { user: true },
  });

  let sent = 0;
  let failed = 0;

  for (const link of links) {
    try {
      const userId = link.userId;

      // Gather data in parallel
      const [tasks, expenses, goals, reminders] = await Promise.all([
        prisma.task.findMany({
          where: { userId, completed: false },
          orderBy: [{ urgency: "desc" }, { dueDate: "asc" }],
        }),
        prisma.expense.findMany({
          where: {
            userId,
            date: { gte: todayStart },
          },
        }),
        prisma.goal.findMany({
          where: { userId, completed: false },
        }),
        prisma.reminder.findMany({
          where: { userId, completed: false },
          orderBy: { datetime: "asc" },
        }),
      ]);

      const sections: string[] = [];

      // Header
      const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
      sections.push(`${greeting} *${link.telegramName || "there"}*! Here's your daily LifeFlow summary.\n`);

      // Overdue tasks
      const overdueTasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < todayStart);
      if (overdueTasks.length > 0) {
        const list = overdueTasks
          .slice(0, 5)
          .map((t) => `  • *${t.title}* [${t.urgency}]`)
          .join("\n");
        sections.push(`Overdue (${overdueTasks.length}):\n${list}`);
      }

      // Today's tasks
      const todayTasks = tasks.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= todayStart && d < todayEnd;
      });
      if (todayTasks.length > 0) {
        const list = todayTasks
          .slice(0, 5)
          .map((t) => `  • *${t.title}* [${t.urgency}]`)
          .join("\n");
        sections.push(`Due today (${todayTasks.length}):\n${list}`);
      }

      // High urgency tasks (not already shown)
      const highUrgency = tasks.filter(
        (t) => t.urgency === "high" && !overdueTasks.includes(t) && !todayTasks.includes(t)
      );
      if (highUrgency.length > 0) {
        const list = highUrgency
          .slice(0, 3)
          .map((t) => {
            const days = t.dueDate
              ? Math.ceil((new Date(t.dueDate).getTime() - now.getTime()) / 86400000)
              : null;
            const due = days !== null ? (days <= 0 ? "today" : `in ${days}d`) : "";
            return `  • *${t.title}* ${due}`;
          })
          .join("\n");
        sections.push(`High priority:\n${list}`);
      }

      // Reminders due today
      const todayDueReminders = reminders.filter((r) => {
        const d = new Date(r.datetime);
        return d >= todayStart && d < todayEnd;
      });
      const newTodayReminders = todayDueReminders.filter((r) => !r.lastNotifiedAt || new Date(r.lastNotifiedAt) < todayStart);
      if (newTodayReminders.length > 0) {
        const list = newTodayReminders
          .slice(0, 5)
          .map((r) => `  • *${r.title}* at ${new Date(r.datetime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`)
          .join("\n");
        sections.push(`Reminders today (${newTodayReminders.length}):\n${list}`);
      }

      // Expenses today
      if (expenses.length > 0) {
        const total = expenses.reduce((s, e) => s + e.amount, 0);
        const byCat = expenses.reduce((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + e.amount;
          return acc;
        }, {} as Record<string, number>);
        const breakdown = Object.entries(byCat)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([cat, amt]) => `  • ${cat}: ₹${amt.toLocaleString()}`)
          .join("\n");
        sections.push(`Today's spend: *₹${total.toLocaleString()}*\n${breakdown}`);
      }

      // Goal progress
      const activeGoals = goals.filter((g) => !g.completed && g.target);
      if (activeGoals.length > 0) {
        const list = activeGoals
          .slice(0, 3)
          .map((g) => {
            const pct = Math.round((g.current / g.target!) * 100);
            const bar = pct >= 100 ? "Done!" : pct >= 75 ? "Almost there" : `${pct}%`;
            return `  • *${g.title}*: ${bar}`;
          })
          .join("\n");
        sections.push(`Goals:\n${list}`);
      }

      // Summary
      sections.push(
        `Summary: ${tasks.length} tasks | ${goals.length} goals | ${reminders.length} reminders`
      );

      // If nothing notable, send a light message
      if (sections.length <= 2) {
        sections.push("All clear! No urgent items today. Have a great day.");
      }

      const message = sections.join("\n\n");
      await sendTelegramMessage(Number(link.telegramUserId), message);

      if (todayDueReminders.length > 0) {
        await prisma.reminder.updateMany({
          where: { id: { in: todayDueReminders.map((r) => r.id) } },
          data: { lastNotifiedAt: now },
        });
      }

      sent++;
    } catch (err) {
      console.error(`Failed to send to ${link.telegramUserId}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: links.length });
}
