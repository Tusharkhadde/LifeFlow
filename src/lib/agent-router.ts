/**
 * Agent Router - Central orchestration system for Telegram messages
 * Flows: Telegram → Router → LangGraph AI Assistant (LLM + Native Tool Calling)
 */

import { prisma } from "@/lib/db";
import { runLangGraphAssistant } from "@/lib/agent-langgraph";

export interface Message {
  text: string;
  telegramUserId: number;
  chatId: number;
  hasAttachment?: boolean;
  attachmentType?: "image" | "document";
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
  followUpQuestions?: string[];
}

class AgentRouter {
  async route(message: Message): Promise<ExecutionResult> {
    try {
      // 1. Get user context
      const telegramLink = await prisma.telegramLink.findUnique({
        where: { telegramUserId: BigInt(message.telegramUserId) },
        include: { user: true },
      });

      if (!telegramLink) {
        return {
          success: false,
          message: "User not linked. Please link your account first using /link <code>.",
        };
      }

      const userId = telegramLink.userId;

      // 2. Delegate to LangGraph Assistant (LLM + Native Tool Calling)
      const assistantResult = await runLangGraphAssistant({
        text: message.text,
        userId,
        telegramUserId: message.telegramUserId,
        chatId: message.chatId,
      });

      return {
        success: assistantResult.success,
        message: assistantResult.message,
      };
    } catch (error) {
      console.error("[AgentRouter Error]", error);
      return {
        success: false,
        message: "Something went wrong processing your request. Please try again.",
      };
    }
  }
}

export const agentRouter = new AgentRouter();
