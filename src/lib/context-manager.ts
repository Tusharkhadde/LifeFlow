/**
 * Context Manager for 32K Token API Limits
 * Manages token budget, automatic chat session rollover, and history restoration.
 */

import { getAIConfig } from "@/lib/ai-provider";

export interface ChatMessageItem {
  role: "system" | "user" | "assistant";
  content: string;
  tool_calls?: unknown[];
}

export interface SessionContextState {
  sessionId: string;
  summary: string | null;
  messages: ChatMessageItem[];
}

// 32k Context Limits
export const MAX_CONTEXT_TOKENS = 32000;
export const SAFE_TOKEN_LIMIT = 24000; // Trigger rollover before hitting 32k limit
const CHARS_PER_TOKEN = 4; // Standard approximation: 1 token ~= 4 chars

/**
 * Estimate total token count for a list of messages
 */
export function estimateTokens(messages: ChatMessageItem[], systemPrompt: string = ""): number {
  let totalChars = systemPrompt.length;
  for (const msg of messages) {
    totalChars += (msg.content || "").length;
    if (msg.tool_calls) {
      totalChars += JSON.stringify(msg.tool_calls).length;
    }
  }
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

/**
 * Check if the total messages exceed the safe token budget (24k tokens)
 */
export function isContextNearLimit(messages: ChatMessageItem[], systemPrompt: string = ""): boolean {
  const tokenCount = estimateTokens(messages, systemPrompt);
  return tokenCount >= SAFE_TOKEN_LIMIT;
}

/**
 * Summarize older conversation history using LLM or structured extraction to preserve core facts
 */
export async function summarizeHistoryForRestoration(
  olderMessages: ChatMessageItem[],
  existingSummary: string | null = null
): Promise<string> {
  const config = getAIConfig();

  const conversationText = olderMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const prompt = `Summarize the key facts, user preferences, saved items, and important context from this previous conversation history into a concise 3-4 sentence memory restoration summary.

Existing Prior Memory:
${existingSummary || "None"}

Previous Conversation Transcript:
${conversationText}`;

  if (!config) {
    return `Prior session summary: User engaged in chat. Recent topics: ${olderMessages.slice(-4).map(m => m.content.slice(0, 50)).join("; ")}`;
  }

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow AI Second Brain",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.2,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "Prior session summary restored.";
    }
  } catch (err) {
    console.error("[ContextManager] Summarization error:", err);
  }

  return `Restored Context: User discussed: ${olderMessages.slice(-3).map(m => m.content.slice(0, 40)).join(", ")}`;
}

/**
 * Performs automatic chat rollover if the 32K context is full.
 * Trims old detailed turns, creates a Restored Memory Summary, and attaches it to a new chat window.
 */
export async function manageContextWindow(
  messages: ChatMessageItem[],
  systemPrompt: string,
  existingSummary: string | null = null
): Promise<{
  formattedMessages: ChatMessageItem[];
  updatedSummary: string | null;
  rolledOver: boolean;
}> {
  const currentTokens = estimateTokens(messages, systemPrompt);

  if (currentTokens < SAFE_TOKEN_LIMIT && messages.length <= 15) {
    const fullSystemPrompt = existingSummary
      ? `${systemPrompt}\n\n[RESTORED PRIOR CHAT MEMORY]:\n${existingSummary}`
      : systemPrompt;

    return {
      formattedMessages: [{ role: "system", content: fullSystemPrompt }, ...messages],
      updatedSummary: existingSummary,
      rolledOver: false,
    };
  }

  // OVERFLOW / ROLLOVER TRIGGERED:
  const splitIndex = Math.max(1, messages.length - 4);
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  console.log(`[ContextManager] 32K Context Limit Reached (${currentTokens} tokens). Initiating session rollover & history restoration...`);

  const newSummary = await summarizeHistoryForRestoration(olderMessages, existingSummary);

  const restoredSystemPrompt = `${systemPrompt}\n\n[RESTORED PRIOR CHAT MEMORY & HISTORY]:\n${newSummary}`;

  return {
    formattedMessages: [{ role: "system", content: restoredSystemPrompt }, ...recentMessages],
    updatedSummary: newSummary,
    rolledOver: true,
  };
}
