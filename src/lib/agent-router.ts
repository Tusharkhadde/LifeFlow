/**
 * Agent Router - Central orchestration system for Telegram & Web Knowledge Vault
 * Integrates Web Scraping, AI Memory Synthesis, and RAG Knowledge Querying
 */

import { prisma } from "@/lib/db";
import { isURL, processAndSynthesizeInput, queryKnowledgeVault } from "@/lib/knowledge-engine";

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
      // 1. Get user context from Telegram link
      const telegramLink = await prisma.telegramLink.findUnique({
        where: { telegramUserId: BigInt(message.telegramUserId) },
        include: { user: true },
      });

      if (!telegramLink) {
        return {
          success: false,
          message: "You're not linked yet! Send /link <code> to connect your LifeFlow account.",
        };
      }

      const userId = telegramLink.userId;
      const text = message.text.trim();

      // 2. Check if input is a Web Link URL
      if (isURL(text)) {
        const processed = await processAndSynthesizeInput(text);

        const savedItem = await prisma.knowledgeItem.create({
          data: {
            userId,
            title: processed.title,
            summary: processed.summary,
            aiMemory: processed.aiMemory,
            type: processed.type,
            category: processed.category,
            tags: processed.tags,
            sourceUrl: processed.sourceUrl || null,
            favicon: processed.favicon || null,
            content: processed.content || null,
          },
        });

        const reply = `✅ *Saved to AI Second Brain!*\n\n📌 *${savedItem.title}*\n💡 _${savedItem.aiMemory || savedItem.summary}_\n🏷️ Tags: \`${(Array.isArray(savedItem.tags) ? savedItem.tags : []).join(", ")}\`\n🔗 [Open Resource](${savedItem.sourceUrl})`;

        return {
          success: true,
          message: reply,
          data: savedItem,
        };
      }

      // 3. Otherwise, treat as a Knowledge Query / Search ("Ask Your Brain")
      const searchResult = await queryKnowledgeVault(userId, text);

      return {
        success: true,
        message: searchResult.reply,
        data: searchResult.matchingItems,
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
