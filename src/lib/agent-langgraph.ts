import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ALL_TOOLS_DEFINITIONS, TOOL_DISPATCH, withRetry } from "@/lib/agent-tools";
import { prisma } from "@/lib/db";

// State annotation for LangGraph Agent
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userId: Annotation<string>(),
  telegramUserId: Annotation<number>(),
  chatId: Annotation<number>(),
  userContext: Annotation<Record<string, unknown>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  finalResponse: Annotation<string>(),
});

export type AgentStateType = typeof AgentStateAnnotation.State;

// Simple in-memory history store per Telegram user (stores last 20 messages)
const conversationHistoryStore = new Map<number, BaseMessage[]>();

export function getConversationHistory(telegramUserId: number): BaseMessage[] {
  return conversationHistoryStore.get(telegramUserId) || [];
}

export function saveConversationHistory(telegramUserId: number, messages: BaseMessage[]) {
  const existing = conversationHistoryStore.get(telegramUserId) || [];
  const updated = [...existing, ...messages].slice(-20); // Keep last 20 messages for context
  conversationHistoryStore.set(telegramUserId, updated);
}

// Call LLM with native tool calling
async function callLLMWithTools(
  messages: BaseMessage[],
  systemPrompt: string,
  modelOverride?: string
) {
  const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const model = modelOverride || process.env.OPENAI_MODEL || "meta-llama/llama-3.2-11b-vision-instruct:free";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment");
  }

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((msg) => {
      if (msg instanceof HumanMessage) return { role: "user", content: msg.content.toString() };
      if (msg instanceof AIMessage) {
        const item: Record<string, unknown> = { role: "assistant", content: msg.content.toString() };
        if (msg.additional_kwargs?.tool_calls) {
          item.tool_calls = msg.additional_kwargs.tool_calls;
        }
        return item;
      }
      return { role: "user", content: msg.content.toString() };
    }),
  ];

  const payload = {
    model,
    messages: formattedMessages,
    tools: ALL_TOOLS_DEFINITIONS,
    tool_choice: "auto",
    temperature: 0.2,
  };

  const response = await withRetry(async () => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow AI Assistant",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LLM API returned status ${res.status}: ${errorText}`);
    }

    return res.json();
  });

  const choice = response.choices?.[0]?.message;
  return choice;
}

// Node 1: Agent Reasoner Node
async function agentNode(state: AgentStateType) {
  const user = await prisma.user.findUnique({
    where: { id: state.userId },
  });

  const currentDate = new Date().toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const systemPrompt = `You are LifeFlow AI, an intelligent personal assistant on Telegram.
You assist the user with managing expenses, income, budgets, tasks, reminders, goals, analytics, profile settings, and querying data.

Current date & time: ${currentDate}
User Name: ${user?.name || "Friend"}
Monthly Budget: ₹${(user?.monthlyBudget || 25000).toLocaleString()}

CRITICAL INSTRUCTIONS:
1. Always analyze the user's input and select the most appropriate tool to call automatically.
2. For expenses (e.g. "bought mouse for ₹2000", "spent 250 on coffee", "paid rent 18000"): Call createExpense(amount, category, description).
3. For income (e.g. "salary credited 70000", "got freelance payment 5000"): Call createIncome(amount, category, description).
4. For budget (e.g. "set monthly budget to 25000"): Call updateBudget(monthlyBudget).
5. For reminders (e.g. "remind me to pay bill tomorrow at 5pm"): Call createReminder(title, datetime).
6. For tasks (e.g. "need to file report by Friday"): Call createTask(title, category, urgency, dueDate).
7. For goals (e.g. "save 50k for trip by Dec"): Call createGoal(title, target, deadline).
8. For analytics (e.g. "show this month's expenses", "how much did I spend?"): Call getAnalytics() or searchExpenses().
9. For searching expenses or DB query: Call searchExpenses() or queryDatabase().
10. If essential information for a tool is completely missing (e.g. user says "add an expense" with no amount or item), ask a friendly clarification question instead of invoking the tool with invalid values.
11. Generate warm, concise, human-like responses. Never use raw JSON in user responses.`;

  const llmResponse = await callLLMWithTools(state.messages, systemPrompt);

  if (!llmResponse) {
    return {
      messages: [new AIMessage("I'm sorry, I couldn't process your request right now. Please try again.")],
      finalResponse: "I'm sorry, I couldn't process your request right now. Please try again.",
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
      const toolResult = await handler(state.userId, args, state.chatId);
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

// Conditional Routing Logic
function shouldContinue(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = (lastMessage?.additional_kwargs?.tool_calls as Array<unknown>) || [];
  if (toolCalls.length > 0) {
    return "tools";
  }
  return END;
}

// Build & Compile LangGraph StateGraph
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

// High level assistant invocation interface
export async function runLangGraphAssistant(params: {
  text: string;
  userId: string;
  telegramUserId: number;
  chatId: number;
}): Promise<{ success: boolean; message: string }> {
  try {
    const history = getConversationHistory(params.telegramUserId);
    const userMessage = new HumanMessage(params.text);
    const currentMessages = [...history, userMessage];

    const result = await langGraphAssistant.invoke({
      messages: currentMessages,
      userId: params.userId,
      telegramUserId: params.telegramUserId,
      chatId: params.chatId,
    });

    const finalReply = result.finalResponse || result.messages[result.messages.length - 1]?.content?.toString() || "Processed successfully.";

    saveConversationHistory(params.telegramUserId, [userMessage, new AIMessage(finalReply)]);

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
