import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { processAndSynthesizeInput, indexKnowledgeItemEmbedding } from "@/lib/knowledge-engine";
import { ingestContext } from "@/lib/context-graph";
import { publishAppEvent } from "@/lib/events";
import { findDuplicateKnowledge } from "@/lib/duplicate-detection";
import { v1Error, v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

const KNOWLEDGE_TYPES = new Set(["link", "note", "document", "audio"]);

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
    return v1Json({ items }, 200, request);
  } catch (error) {
    return v1Fail(error, request, "Failed to list knowledge");
  }
}

function withoutHash(input: string) {
  try {
    const url = new URL(input);
    url.hash = "";
    return url.toString();
  } catch {
    return input;
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "vault:write");
    const body = await request.json();
    const input = body.input || body.url || body.content;
    if (!input || typeof input !== "string" || !input.trim()) {
      return v1Error("input is required", 400, request);
    }

    const trimmed = input.trim().slice(0, 50000);
    const isUrl = /^https?:\/\//i.test(trimmed);
    const lookupUrl = isUrl ? withoutHash(trimmed) : trimmed;
    if (isUrl) {
      for (const sourceUrl of new Set([lookupUrl, trimmed])) {
        const dup = await findDuplicateKnowledge(userId, { sourceUrl });
        if (dup.duplicate && dup.existing) {
          return v1Json({ item: dup.existing, alreadySaved: true }, 200, request);
        }
      }
    }

    const forceType = KNOWLEDGE_TYPES.has(body.type) ? body.type : undefined;
    const processed = await processAndSynthesizeInput(isUrl ? lookupUrl : trimmed, forceType, {
      clippedText: typeof body.text === "string" ? body.text : undefined,
      titleHint: typeof body.title === "string" ? body.title : undefined,
    });

    if (processed.sourceUrl && processed.sourceUrl !== lookupUrl) {
      const again = await findDuplicateKnowledge(userId, { sourceUrl: processed.sourceUrl });
      if (again.duplicate && again.existing) {
        return v1Json({ item: again.existing, alreadySaved: true }, 200, request);
      }
    }

    const noteSource =
      !processed.sourceUrl && typeof body.sourceUrl === "string" && /^https?:\/\//i.test(body.sourceUrl)
        ? body.sourceUrl.slice(0, 2000)
        : null;

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
        metadata: noteSource ? { clippedFrom: noteSource, source: "extension" } : undefined,
      },
    });
    try {
      await indexKnowledgeItemEmbedding(item.id);
    } catch (error) {
      console.warn("[v1/knowledge] embedding skipped:", error);
    }
    await ingestContext(userId, `${item.title}. ${item.aiMemory || item.summary || ""}`, item.sourceUrl || trimmed);
    await publishAppEvent(userId, "knowledge_saved", { id: item.id, title: item.title });
    return v1Json({ item, alreadySaved: false }, 201, request);
  } catch (error) {
    if (error instanceof Error && /private|invalid url|credentials/i.test(error.message)) {
      return v1Error(error.message, 400, request);
    }
    return v1Fail(error, request, "Failed to save knowledge");
  }
}
