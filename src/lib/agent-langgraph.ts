import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ALL_TOOLS_DEFINITIONS, TOOL_DISPATCH } from "@/lib/agent-tools";
import { prisma } from "@/lib/db";
import { manageContextWindow, ChatMessageItem } from "@/lib/context-manager";

// State annotation for LangGraph Agent
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userId: Annotation<string>(),
  telegramUserId: Annotation<number>(),
  chatId: Annotation<number>(),
  finalResponse: Annotation<string>(),
  summaryMemory: Annotation<string | null>({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentStateAnnotation.State;
import { getAIConfig } from "@/lib/ai-provider";

const conversationHistoryStore = new Map<number, BaseMessage[]>();
const conversationSummaryStore = new Map<number, string>();

export function getConversationHistory(telegramUserId: number): BaseMessage[] {
  return conversationHistoryStore.get(telegramUserId) || [];
}

export function saveConversationHistory(
  telegramUserId: number,
  messages: BaseMessage[],
  summary?: string | null
) {
  const existing = conversationHistoryStore.get(telegramUserId) || [];
  const updated = [...existing, ...messages].slice(-15);
  conversationHistoryStore.set(telegramUserId, updated);
  if (summary) {
    conversationSummaryStore.set(telegramUserId, summary);
  }
}

async function callLLMWithTools(
  messages: BaseMessage[],
  systemPrompt: string,
  existingSummary: string | null = null
) {
  const config = getAIConfig();

  if (!config) {
    throw new Error("OPENAI_API_KEY is not set in environment");
  }

  // Convert BaseMessage items to ChatMessageItem format
  const rawItems: ChatMessageItem[] = messages.map((msg) => {
    if (msg instanceof HumanMessage) return { role: "user", content: msg.content.toString() };
    if (msg instanceof AIMessage) {
      const item: ChatMessageItem = { role: "assistant", content: msg.content.toString() };
      if (msg.additional_kwargs?.tool_calls) {
        item.tool_calls = msg.additional_kwargs.tool_calls as unknown[];
      }
      return item;
    }
    return { role: "user", content: msg.content.toString() };
  });

  // Apply 32K Context Window Management & History Restoration
  const { formattedMessages, updatedSummary } = await manageContextWindow(
    rawItems,
    systemPrompt,
    existingSummary
  );

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
      messages: formattedMessages,
      tools: ALL_TOOLS_DEFINITIONS,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM API returned status ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  return {
    choice: data.choices?.[0]?.message,
    updatedSummary,
  };
}

// Node 1: Agent Reasoner Node
async function agentNode(state: AgentStateType) {
  const user = await prisma.user.findUnique({
    where: { id: state.userId },
  });

  const systemPrompt = `You are LifeFlow AI Second Brain Assistant.
You help the user save web links, notes, and query their saved knowledge vault.

User Name: ${user?.name || "Friend"}

INSTRUCTIONS:
1. If the user provides a web link or note to save: call saveKnowledgeItem(input).
2. If the user asks a question about their saved resources (e.g. "website components", "React UI tools"): call searchKnowledgeVault(query).
3. Be conversational, warm, and concise.`;

  const { choice: llmResponse, updatedSummary } = await callLLMWithTools(
    state.messages,
    systemPrompt,
    state.summaryMemory
  );

  if (!llmResponse) {
    return {
      messages: [new AIMessage("I'm sorry, I couldn't process your request right now.")],
      finalResponse: "I'm sorry, I couldn't process your request right now.",
    };
  }

  const toolCalls = llmResponse.tool_calls || [];
  const contentText = llmResponse.content || "";

  const aiMessage = new AIMessage({
    content: contentText,
    additional_kwargs: { tool_calls: toolCalls },
  });

  return {
    messages: [aiMessage],
    summaryMemory: updatedSummary,
  };
}

// Node 2: Tool Execution Node
async function toolsNode(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = (lastMessage?.additional_kwargs?.tool_calls as Array<{
    id: string;
    function: { name: string; arguments: string };
  }>) || [];

  if (toolCalls.length === 0) {
    return {
      finalResponse: lastMessage.content.toString(),
    };
  }

  const results: string[] = [];

  for (const toolCall of toolCalls) {
    const fnName = toolCall.function.name;
    let args: unknown = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      args = {};
    }

    const handler = TOOL_DISPATCH[fnName];
    if (handler) {
      const toolResult = await handler(state.userId, args);
      results.push(toolResult.message);
    } else {
      results.push(`Tool ${fnName} is not supported.`);
    }
  }

  const combinedResponse = results.join("\n\n");
  return {
    messages: [new AIMessage(combinedResponse)],
    finalResponse: combinedResponse,
  };
}

function shouldContinue(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = (lastMessage?.additional_kwargs?.tool_calls as Array<unknown>) || [];
  if (toolCalls.length > 0) {
    return "tools";
  }
  return END;
}

const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    [END]: END,
  })
  .addEdge("tools", END);

export const langGraphAssistant = workflow.compile();

export async function runLangGraphAssistant(params: {
  text: string;
  userId: string;
  telegramUserId: number;
  chatId: number;
}): Promise<{ success: boolean; message: string }> {
  try {
    const history = getConversationHistory(params.telegramUserId);
    const existingSummary = conversationSummaryStore.get(params.telegramUserId) || null;
    const userMessage = new HumanMessage(params.text);
    const currentMessages = [...history, userMessage];

    const result = await langGraphAssistant.invoke({
      messages: currentMessages,
      userId: params.userId,
      telegramUserId: params.telegramUserId,
      chatId: params.chatId,
      summaryMemory: existingSummary,
    });

    const finalReply =
      result.finalResponse ||
      result.messages[result.messages.length - 1]?.content?.toString() ||
      "Processed successfully.";

    saveConversationHistory(
      params.telegramUserId,
      [userMessage, new AIMessage(finalReply)],
      result.summaryMemory
    );

    return {
      success: true,
      message: finalReply,
    };
  } catch (error) {
    console.error("[LangGraph Assistant Error]", error);
    return {
      success: false,
      message: "An unexpected error occurred. Please try again.",
    };
  }
}
