import { prisma } from "@/lib/db";
import { processAndSynthesizeInput } from "@/lib/knowledge-engine";

export interface ActionParams {
  input?: string;
  title?: string;
  category?: string;
  type?: "link" | "note" | "document" | "audio";
}

export async function saveKnowledgeMemory(
  userId: string,
  params: ActionParams
) {
  const rawInput = params.input || params.title || "Note";
  const processed = await processAndSynthesizeInput(rawInput, params.type);

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

  return item;
}
