/**
 * Agent Router - Central orchestration system for Telegram & Web Knowledge Vault
 * Integrates Web Scraping, AI Memory Synthesis, and RAG Knowledge Querying
 */

import { prisma } from "@/lib/db";
import { isURL, processAndSynthesizeInput, queryKnowledgeVault } from "@/lib/knowledge-engine";
import { extractPersonalFact, rememberPersonalFact } from "@/lib/personal-memory";
import { createReminder, createTask, formatUserDate } from "@/lib/productivity-actions";
import { ingestContext } from "@/lib/context-graph";
import { proposeReminder, triageInbox } from "@/lib/inbox-triage";

export interface Message {
  text: string;
  telegramUserId: number;
  chatId: number;
  telegramMessageId?: number;
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
      await ingestContext(userId, text, `telegram:${message.telegramMessageId || "message"}`);

      const conversation = await prisma.conversation.upsert({
        where: {
          userId_telegramChatId: {
            userId,
            telegramChatId: BigInt(message.chatId),
          },
        },
        create: {
          userId,
          telegramChatId: BigInt(message.chatId),
        },
        update: {},
      });

      const existingMessage = message.telegramMessageId
        ? await prisma.conversationMessage.findFirst({
            where: {
              conversationId: conversation.id,
              telegramMessageId: message.telegramMessageId,
            },
          })
        : null;

      if (existingMessage) {
        const previousReply = await prisma.conversationMessage.findFirst({
          where: {
            conversationId: conversation.id,
            role: "assistant",
            createdAt: { gt: existingMessage.createdAt },
          },
          orderBy: { createdAt: "asc" },
        });
        if (previousReply) {
          return { success: true, message: "", data: null };
        }
      }

      const recentMessages = await prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 12,
      });

      if (!existingMessage) {
        await prisma.conversationMessage.create({
          data: {
            conversationId: conversation.id,
            role: "user",
            content: text,
            telegramMessageId: message.telegramMessageId,
          },
        });
      }

      const conversationContext = recentMessages
        .reverse()
        .map((item) => `${item.role}: ${item.content.slice(0, 1500)}`)
        .join("\n");

      const saveReply = async (reply: string) => {
        await prisma.conversationMessage.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: reply,
          },
        });
        return reply;
      };

      const reminderMatch = text.match(/^remind me to (.+?)\s+(?:at|in)\s+(.+)$/i);
      if (reminderMatch) {
        await proposeReminder(userId, message.chatId, text, reminderMatch[1], reminderMatch[2]);
        return { success: true, message: await saveReply(`I can set a reminder for *${reminderMatch[1]}* at *${reminderMatch[2]}*. Reply /confirm to create it or /cancel to discard it.`) };
      }

      const taskMatch = text.match(/^(?:add|create) task[:\s]+(.+)$/i);
      if (taskMatch) {
        const task = await createTask(userId, taskMatch[1]);
        return { success: true, message: await saveReply(`✅ Task created: *${task.title}*`) };
      }


      const rememberedFact = await extractPersonalFact(userId, text);
      if (rememberedFact) {
        return { success: true, message: await saveReply(`🧠 I'll remember that your ${rememberedFact.key} is ${rememberedFact.value}.`) };
      }

      const triage = await triageInbox(text);
      if (triage?.reminderText && triage.reminderWhen) {
        await proposeReminder(userId, message.chatId, text, triage.reminderText, triage.reminderWhen);
        return { success: true, message: await saveReply(`I found a reminder request: *${triage.reminderText}* at *${triage.reminderWhen}*. Reply /confirm to create it or /cancel to discard it.`) };
      }
      if (triage?.memoryKey && triage.memoryValue) {
        const memory = await rememberPersonalFact(userId, triage.memoryKey, triage.memoryValue, text);
        return { success: true, message: await saveReply(`🧠 I'll remember that your ${memory.key} is ${memory.value}.`) };
      }

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
        await ingestContext(userId, `${savedItem.title}. ${savedItem.aiMemory || savedItem.summary || ""}`, savedItem.sourceUrl || text);

        const reply = `✅ *Saved to AI Second Brain!*\n\n📌 *${savedItem.title}*\n💡 _${savedItem.aiMemory || savedItem.summary}_\n🏷️ Tags: \`${(Array.isArray(savedItem.tags) ? savedItem.tags : []).join(", ")}\`\n🔗 [Open Resource](${savedItem.sourceUrl})`;

        return {
          success: true,
          message: await saveReply(reply),
          data: savedItem,
        };
      }

      // 3. Otherwise, treat as a Knowledge Query / Search ("Ask Your Brain")
      const searchResult = await queryKnowledgeVault(userId, text, conversationContext);

      return {
        success: true,
        message: await saveReply(searchResult.reply),
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
