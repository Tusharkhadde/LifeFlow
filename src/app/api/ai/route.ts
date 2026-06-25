import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const systemPrompt = `You are LifeFlow AI, a personal life operating system assistant. You help users manage their tasks, expenses, goals, reminders, and documents. Be helpful, concise, and proactive in your suggestions.

Current context:
- Tasks: ${context?.tasks || 0} pending
- Expenses: ₹${context?.totalExpenses || 0} this month
- Goals: ${context?.goals || 0} active
- Reminders: ${context?.reminders || 0} pending

Respond in a helpful, action-oriented way. If the user asks what to do today, prioritize by urgency and consequence.`;

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
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const fallbackResponse = generateFallbackResponse(message);
      return NextResponse.json({ response: fallbackResponse });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "I couldn't process that. Please try again.";

    return NextResponse.json({ response: aiResponse });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function generateFallbackResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("today") || lower.includes("do")) {
    return "Based on your priorities, I recommend focusing on your most urgent tasks first. Check your dashboard for the full prioritized list.";
  }
  if (lower.includes("bill") || lower.includes("pay")) {
    return "Check your dashboard for upcoming bills. I recommend setting up auto-reminders 2 days before each due date.";
  }
  if (lower.includes("expense") || lower.includes("spend")) {
    return "Review your expense tracker for category breakdowns and savings recommendations. Look for anomalies in recurring charges.";
  }
  return "I'm here to help you manage your life admin. Try asking about your tasks, bills, expenses, or goals!";
}
