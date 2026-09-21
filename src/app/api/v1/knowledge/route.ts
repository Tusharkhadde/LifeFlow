import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { processAndSynthesizeInput, indexKnowledgeItemEmbedding } from "@/lib/knowledge-engine";
import { ingestContext } from "@/lib/context-graph";
import { publishAppEvent } from "@/lib/events";
import { v1Error, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "vault:read");
    const items = await prisma.knowledgeItem.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return v1Json({ items });
  } catch {
    return v1Error("Unauthorized");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "vault:write");
    const body = await request.json();
    const input = body.input || body.url || body.content;
    if (!input) return v1Error("input is required", 400);
    const processed = await processAndSynthesizeInput(String(input), body.type);
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
    await indexKnowledgeItemEmbedding(item.id);
    await ingestContext(userId, `${item.title}. ${item.aiMemory || item.summary || ""}`, item.sourceUrl || String(input));
    await publishAppEvent(userId, "knowledge_saved", { id: item.id, title: item.title });
    return v1Json({ item }, 201);
  } catch {
    return v1Error("Failed to save knowledge", 500);
  }
}
