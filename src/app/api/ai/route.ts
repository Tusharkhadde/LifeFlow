import { NextRequest, NextResponse } from "next/server";
import { getAIConfig } from "@/lib/ai-provider";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const systemPrompt = `You are LifeFlow AI, a personal knowledge and productivity assistant. You help users manage tasks, reminders, and documents. Be helpful, concise, and proactive in your suggestions.

Current context:
- Tasks: ${context?.tasks || 0} pending
- Reminders: ${context?.reminders || 0} pending

Respond in a helpful, action-oriented way. If the user asks what to do today, prioritize by urgency and consequence.`;

    const config = getAIConfig();

    if (!config || !config.baseUrl || !config.model || !config.apiKey) {
      return NextResponse.json({ response: generateFallbackResponse(message) });
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow AI",
      },
      body: JSON.stringify({
        model: config.model,
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
  return "I'm here to help you manage your tasks, reminders, documents, and knowledge vault.";
}
