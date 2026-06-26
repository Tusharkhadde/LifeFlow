import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
  };
  text?: string;
}

async function generateAIResponse(
  message: string,
  userId: string
): Promise<string> {
  const lower = message.toLowerCase();

  // Handle commands
  if (lower === "/start") {
    return `Welcome to *LifeFlow AI Bot*! 

I can help you manage your life from Telegram.

*Available commands:*
/link - Link your LifeFlow account
/tasks - View pending tasks
/expenses - View expense summary
/goals - View goal progress
/reminders - View upcoming reminders
/help - Show this message

Or just ask me anything about your life data!`;
  }

  if (lower === "/help") {
    return `*LifeFlow AI Bot Commands:*

/link <code> - Link your account (get code from web app settings)
/tasks - Your pending tasks
/expenses - Monthly expense summary
/goals - Goal progress overview
/reminders - Upcoming reminders

*Ask me anything:*
"What should I do today?"
"How much did I spend?"
"Am I on track with my goals?"`;
  }

  // Authenticated user actions
  if (!userId) {
    return `You're not linked yet! 

To link your LifeFlow account:
1. Open LifeFlow web app
2. Go to Settings
3. Tap "Link Telegram"
4. Send me the code using /link <code>`;
  }

  if (lower === "/tasks") {
    const tasks = await prisma.task.findMany({
      where: { userId, completed: false },
      orderBy: [{ urgency: "desc" }, { dueDate: "asc" }],
      take: 10,
    });

    if (tasks.length === 0) return "No pending tasks. You're all caught up!";

    const list = tasks
      .map(
        (t, i) =>
          `${i + 1}. *${t.title}* [${t.urgency}]${
            t.dueDate
              ? ` - due ${new Date(t.dueDate).toLocaleDateString()}`
              : ""
          }`
      )
      .join("\n");
    return `*Your pending tasks:*\n\n${list}`;
  }

  if (lower === "/expenses") {
    const now = new Date();
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        date: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    });

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byCat = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

    const breakdown = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `• ${cat}: ₹${amt.toLocaleString()}`)
      .join("\n");

    return `*This month's expenses:*\n\nTotal: *₹${total.toLocaleString()}*\n\n${breakdown || "No expenses yet"}`;
  }

  if (lower === "/goals") {
    const goals = await prisma.goal.findMany({
      where: { userId, completed: false },
      take: 5,
    });

    if (goals.length === 0) return "No active goals. Set one up in the web app!";

    const list = goals
      .map((g) => {
        const pct = g.target
          ? Math.round((g.current / g.target) * 100)
          : 0;
        return `• *${g.title}*: ${pct}% (${g.current}/${g.target || "?"} ${g.unit || ""})`;
      })
      .join("\n");
    return `*Your goals:*\n\n${list}`;
  }

  if (lower === "/reminders") {
    const reminders = await prisma.reminder.findMany({
      where: { userId, completed: false },
      orderBy: { datetime: "asc" },
      take: 5,
    });

    if (reminders.length === 0) return "No pending reminders.";

    const list = reminders
      .map(
        (r) =>
          `• *${r.title}* - ${new Date(r.datetime).toLocaleDateString()}`
      )
      .join("\n");
    return `*Upcoming reminders:*\n\n${list}`;
  }

  // AI-powered response with user data context
  let taskCount = 0;
  let goalCount = 0;
  let expenseTotal = 0;

  try {
    const [tasks, expenses, goals, reminders] = await Promise.all([
      prisma.task.findMany({ where: { userId, completed: false } }),
      prisma.expense.findMany({
        where: {
          userId,
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      prisma.goal.findMany({ where: { userId, completed: false } }),
      prisma.reminder.findMany({ where: { userId, completed: false } }),
    ]);

    taskCount = tasks.length;
    goalCount = goals.length;
    expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);

    const systemPrompt = `You are LifeFlow AI, a personal life assistant. Be concise and helpful. Reply in 2-3 sentences max.

User's current data:
- ${tasks.length} pending tasks (${tasks.filter((t) => t.urgency === "high").length} high urgency)
- ₹${expenseTotal.toLocaleString()} spent this month
- ${goals.length} active goals
- ${reminders.length} pending reminders`;

    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.tokenrouter.com/v1";
    const model = process.env.OPENAI_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

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
          { role: "user", content: message },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const aiResponse =
        data.choices?.[0]?.message?.content ||
        "I couldn't process that. Try again.";
      return aiResponse;
    }
  } catch {
    // Fall through to default
  }

  return `I understand you're asking about "${message}". 

Quick stats:
• ${taskCount} pending tasks
• ₹${expenseTotal.toLocaleString()} total tracked
• ${goalCount} active goals

Ask me something specific like "What's due today?" or "How much did I spend?"`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const msg: TelegramMessage | undefined = body.message;

    if (!msg?.text) {
      return NextResponse.json({ ok: true });
    }

    const telegramUserId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Handle /start and /link without requiring account link
    if (text === "/start" || text === "/help") {
      const response = await generateAIResponse(text, "");
      await sendTelegramMessage(Number(chatId), response);
      return NextResponse.json({ ok: true });
    }

    // Handle /link command
    if (text.startsWith("/link")) {
      const code = text.replace("/link", "").trim();
      if (!code) {
        await sendTelegramMessage(Number(chatId),
          "Usage: /link <code>\n\nGet your code from the LifeFlow web app → Settings → Link Telegram"
        );
        return NextResponse.json({ ok: true });
      }

      // Check if already linked
      const existingLink = await prisma.telegramLink.findUnique({
        where: { telegramUserId: telegramUserId },
      });

      if (existingLink) {
        await sendTelegramMessage(Number(chatId), "Your account is already linked!");
        return NextResponse.json({ ok: true });
      }

      // Look up the link code (must be unexpired)
      const linkCode = await prisma.linkCode.findUnique({
        where: { code },
      });

      if (!linkCode || linkCode.expiresAt < new Date()) {
        await sendTelegramMessage(Number(chatId),
          "Invalid or expired code. Please generate a new one from the LifeFlow web app → Settings → Link Telegram"
        );
        return NextResponse.json({ ok: true });
      }

      // Create the link
      await prisma.telegramLink.create({
        data: {
          userId: linkCode.userId,
          telegramUserId: telegramUserId,
          telegramName: msg.from.first_name,
        },
      });

      // Clean up the used code
      await prisma.linkCode.delete({ where: { code } });

      const user = await prisma.user.findUnique({
        where: { id: linkCode.userId },
      });

      await sendTelegramMessage(Number(chatId),
        `Account linked! Welcome *${user?.name || "User"}*. 

You can now use:
• /tasks - View tasks
• /expenses - View expenses
• /goals - View goals
• /reminders - View reminders

Or just ask me anything!`
      );
      return NextResponse.json({ ok: true });
    }

    // Look up linked user
    const telegramLink = await prisma.telegramLink.findUnique({
      where: { telegramUserId: telegramUserId },
    });

    const userId = telegramLink?.userId || "";
    const response = await generateAIResponse(text, userId);
    await sendTelegramMessage(Number(chatId), response);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

// GET endpoint to check webhook status
export async function GET() {
  const res = await fetch(
    `${TELEGRAM_API}/getWebhookInfo`
  );
  const data = await res.json();
  return NextResponse.json(data);
}
