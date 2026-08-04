import { z } from "zod";
import { prisma } from "@/lib/db";
import { processAndSynthesizeInput, queryKnowledgeVault } from "@/lib/knowledge-engine";

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// Tool 1: saveKnowledgeItem
export const saveKnowledgeItemSchema = z.object({
  input: z.string().min(1, "Input text or URL is required"),
});

export async function executeSaveKnowledgeItem(
  userId: string,
  rawArgs: unknown
): Promise<ToolResult> {
  try {
    const parseResult = saveKnowledgeItemSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return { success: false, message: "Please provide a valid web link or note text." };
    }

    const { input } = parseResult.data;
    const processed = await processAndSynthesizeInput(input);

    const item = await prisma.knowledgeItem.create({
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

    const tagsStr = (Array.isArray(item.tags) ? item.tags : []).join(", ");
    const reply = `✅ Saved to AI Second Brain!\n📌 *${item.title}*\n💡 _${item.aiMemory || item.summary}_\n🏷️ Tags: \`${tagsStr}\``;

    return { success: true, message: reply, data: item };
  } catch (error) {
    console.error("[Tool: saveKnowledgeItem Error]", error);
    return { success: false, message: "Failed to save knowledge item." };
  }
}

// Tool 2: searchKnowledgeVault
export const searchKnowledgeVaultSchema = z.object({
  query: z.string().min(1, "Query is required"),
});

export async function executeSearchKnowledgeVault(
  userId: string,
  rawArgs: unknown
): Promise<ToolResult> {
  try {
    const parseResult = searchKnowledgeVaultSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return { success: false, message: "Please specify what you want to search." };
    }

    const { query } = parseResult.data;
    const result = await queryKnowledgeVault(userId, query);

    return { success: true, message: result.reply, data: result.matchingItems };
  } catch (error) {
    console.error("[Tool: searchKnowledgeVault Error]", error);
    return { success: false, message: "Failed to search knowledge vault." };
  }
}

export const TOOL_DISPATCH: Record<
  string,
  (userId: string, args: unknown) => Promise<ToolResult>
> = {
  saveKnowledgeItem: executeSaveKnowledgeItem,
  searchKnowledgeVault: executeSearchKnowledgeVault,
};

export const ALL_TOOLS_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "saveKnowledgeItem",
      description: "Save a web link or note text into the user's AI Second Brain (auto-scrapes link, extracts memory & tags).",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Web link URL (e.g., https://ui.shadcn.com) or text note" },
        },
        required: ["input"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchKnowledgeVault",
      description: "Search and query saved knowledge memories, web links, and tools (e.g. 'website components', 'React UI libraries').",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query or natural language question" },
        },
        required: ["query"],
      },
    },
  },
];
