import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { ALL_TOOLS_DEFINITIONS, TOOL_DISPATCH } from "@/lib/agent-tools";
import { getPersonaPrompt } from "@/lib/personas";
import { getPersonalMemoryContext } from "@/lib/personal-memory";
import { getRecentContextGraph } from "@/lib/context-graph";
import { executeSmartSearch } from "@/lib/search-pipeline";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildCitations, type Citation } from "@/lib/citations";
import { recordAiUsage, trackedChatCompletion } from "@/lib/ai-telemetry";

export type AssistantEvent =
  | { type: "status"; message: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; success: boolean; message: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: string[] }
  | { type: "citations"; citations: Citation[] }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatCompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

const MAX_TOOL_ROUNDS = 4;

async function buildSystemPrompt(userId: string) {
  const [settings, memory, graph, user] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    getPersonalMemoryContext(userId).catch(() => ""),
    getRecentContextGraph(userId).catch(() => []),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, timezone: true } }),
  ]);

  return `${getPersonaPrompt(settings?.aiPersona || "assistant")}

You are the LifeFlow AI operating system assistant for ${user?.name || "the user"} (timezone ${user?.timezone || "UTC"}, now ${new Date().toISOString()}).
You can ACT using tools: search the vault + web, save links, create tasks and reminders, log expenses and habits, process meetings, run the Morning OS, and remember facts.
Rules:
- Prefer calling a tool over guessing. For any question about saved knowledge or current events, call searchKnowledgeVault.
- When the user states an intent (remind, task, spent, save this), execute it with the right tool, then confirm briefly.
- After tools run, answer concisely in markdown with the outcome. Cite sources as URLs when searchKnowledgeVault returns them.
- Never invent tool results.

What you remember about the user:
${memory || "(nothing yet)"}

Recent context graph:
${graph.slice(0, 12).join("\n") || "(empty)"}`;
}

async function chatCompletion(
  userId: string,
  messages: ChatCompletionMessage[],
  options: { tools?: boolean; stream?: boolean }
) {
  const config = getAIConfig();
  if (!config) throw new Error("AI provider not configured");
  if (!options.stream) {
    const { data } = await trackedChatCompletion({
      userId,
      operation: options.tools ? "assistant_tool_planning" : "assistant_response",
      modelClass: "primary",
      request: {
        messages,
        temperature: 0.3,
        ...(options.tools ? { tools: ALL_TOOLS_DEFINITIONS, tool_choice: "auto" } : {}),
      },
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const started = Date.now();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      stream: Boolean(options.stream),
      ...(options.tools ? { tools: ALL_TOOLS_DEFINITIONS, tool_choice: "auto" } : {}),
    }),
  });
  void recordAiUsage({
    userId,
    provider: "openai-compatible",
    operation: "assistant_stream",
    model: config.model,
    latencyMs: Date.now() - started,
  });
  return response;
}

async function* streamTokens(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

function extractSources(toolOutputs: Array<{ name: string; data?: unknown }>) {
  const sources = new Set<string>();
  for (const output of toolOutputs) {
    if (output.name !== "searchKnowledgeVault") continue;
    const data = output.data as { matchingItems?: Array<{ item?: { sourceUrl?: string | null } }>; exaResults?: Array<{ url?: string }> } | undefined;
    for (const match of data?.matchingItems || []) if (match.item?.sourceUrl) sources.add(match.item.sourceUrl);
    for (const result of data?.exaResults || []) if (result.url) sources.add(result.url);
  }
  return Array.from(sources).slice(0, 8);
}

function extractCitations(toolOutputs: Array<{ name: string; data?: unknown }>) {
  for (const output of toolOutputs) {
    if (output.name !== "searchKnowledgeVault") continue;
    const data = output.data as {
      matchingItems?: Parameters<typeof buildCitations>[0];
      exaResults?: Parameters<typeof buildCitations>[1];
    } | undefined;
    return buildCitations(data?.matchingItems || [], data?.exaResults || []);
  }
  return [] as Citation[];
}

export async function* runAssistant(
  userId: string,
  history: AssistantMessage[],
  input: string
): AsyncGenerator<AssistantEvent> {
  const rate = await checkRateLimit(userId, "ai_chat");
  if (!rate.allowed) {
    yield { type: "error", message: "You've hit the hourly assistant limit. Try again soon." };
    return;
  }

  const config = getAIConfig();
  if (!config) {
    const fallback = await executeSmartSearch(userId, input, "", { useExa: true, source: "assistant" });
    yield { type: "token", text: fallback.reply };
    yield { type: "sources", sources: fallback.sources };
    yield { type: "citations", citations: fallback.citations };
    yield { type: "done", reply: fallback.reply };
    return;
  }

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: await buildSystemPrompt(userId) },
    ...history.slice(-10).map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: input },
  ];

  const toolOutputs: Array<{ name: string; data?: unknown }> = [];
  let toolsSupported = true;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    yield { type: "status", message: round === 0 ? "Thinking…" : "Continuing…" };
    const response = await chatCompletion(userId, messages, { tools: toolsSupported });

    if (!response.ok) {
      if (toolsSupported) {
        toolsSupported = false;
        round--;
        continue;
      }
      break;
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message as ChatCompletionMessage | undefined;
    if (!choice) break;

    const toolCalls = choice.tool_calls || [];
    if (toolCalls.length === 0) {
      const reply = choice.content || "";
      if (reply) {
        yield { type: "token", text: reply };
        const sources = extractSources(toolOutputs);
        if (sources.length) yield { type: "sources", sources };
        const citations = extractCitations(toolOutputs);
        if (citations.length) yield { type: "citations", citations };
        yield { type: "done", reply };
        return;
      }
      break;
    }

    messages.push({ role: "assistant", content: choice.content || null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      yield { type: "tool_start", name: call.function.name, args };
      const handler = TOOL_DISPATCH[call.function.name];
      const result = handler
        ? await handler(userId, args).catch((error: unknown) => ({
            success: false,
            message: error instanceof Error ? error.message : "Tool failed",
          }))
        : { success: false, message: `Unknown tool ${call.function.name}` };
      toolOutputs.push({ name: call.function.name, data: (result as { data?: unknown }).data });
      yield { type: "tool_result", name: call.function.name, success: result.success, message: result.message.slice(0, 600) };
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ success: result.success, message: result.message.slice(0, 4000) }),
      });
    }
  }

  yield { type: "status", message: "Writing answer…" };
  const finalResponse = await chatCompletion(userId, messages, { tools: false, stream: true });
  if (!finalResponse.ok || !finalResponse.body) {
    const fallback = await executeSmartSearch(userId, input, "", { useExa: true, source: "assistant" });
    yield { type: "token", text: fallback.reply };
    yield { type: "sources", sources: fallback.sources };
    yield { type: "citations", citations: fallback.citations };
    yield { type: "done", reply: fallback.reply };
    return;
  }

  let reply = "";
  for await (const token of streamTokens(finalResponse)) {
    reply += token;
    yield { type: "token", text: token };
  }
  const sources = extractSources(toolOutputs);
  if (sources.length) yield { type: "sources", sources };
  const citations = extractCitations(toolOutputs);
  if (citations.length) yield { type: "citations", citations };
  yield { type: "done", reply };
}
