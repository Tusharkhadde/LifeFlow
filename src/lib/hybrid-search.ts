import { getAIConfig } from "@/lib/ai-provider";
import { prisma } from "@/lib/db";
import {
  buildSearchableText,
  cosineSimilarity,
  generateEmbedding,
  parseStoredEmbedding,
} from "@/lib/embeddings";
import type { KnowledgeItem } from "@prisma/client";

export interface ScoredKnowledgeItem {
  item: KnowledgeItem;
  score: number;
  keywordScore: number;
  semanticScore: number;
}

function scoreKeywordMatch(item: KnowledgeItem, queryWords: string[]): number {
  let score = 0;
  const titleLower = item.title.toLowerCase();
  const memoryLower = (item.aiMemory || "").toLowerCase();
  const summaryLower = (item.summary || "").toLowerCase();
  const categoryLower = item.category.toLowerCase();
  const tagsArray = (Array.isArray(item.tags) ? item.tags : []) as string[];
  const tagsStr = tagsArray.join(" ").toLowerCase();
  const contentLower = (item.content || "").toLowerCase();

  for (const word of queryWords) {
    if (titleLower.includes(word)) score += 5;
    if (tagsStr.includes(word)) score += 4;
    if (memoryLower.includes(word)) score += 3;
    if (categoryLower.includes(word)) score += 2;
    if (summaryLower.includes(word)) score += 1;
    if (contentLower.includes(word)) score += 1;
  }
  return score;
}

export async function indexKnowledgeItemEmbedding(itemId: string) {
  const item = await prisma.knowledgeItem.findUnique({ where: { id: itemId } });
  if (!item) return null;

  const text = buildSearchableText(item);
  const embedding = await generateEmbedding(text);
  if (!embedding) return null;

  await prisma.knowledgeItem.update({
    where: { id: itemId },
    data: { embedding },
  });
  return embedding;
}

export async function hybridSearchKnowledge(
  userId: string,
  query: string,
  limit = 8
): Promise<ScoredKnowledgeItem[]> {
  const allItems = await prisma.knowledgeItem.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "desc" },
  });

  if (allItems.length === 0) return [];

  const qLower = query.toLowerCase();
  const queryWords = qLower.split(/\s+/).filter((w) => w.length > 2);
  const queryEmbedding = await generateEmbedding(query);

  const scored: ScoredKnowledgeItem[] = allItems.map((item) => {
    const keywordScore = scoreKeywordMatch(item, queryWords);
    let semanticScore = 0;

    if (queryEmbedding) {
      const stored = parseStoredEmbedding(item.embedding);
      if (stored) {
        semanticScore = cosineSimilarity(queryEmbedding, stored) * 10;
      }
    }

    const score = keywordScore + semanticScore;
    return { item, score, keywordScore, semanticScore };
  });

  const filtered = scored.filter((entry) => entry.score > 0);

  if (filtered.length === 0 && queryEmbedding) {
    return scored
      .map((entry) => {
        const stored = parseStoredEmbedding(entry.item.embedding);
        const semanticScore = stored ? cosineSimilarity(queryEmbedding, stored) * 10 : 0;
        return { ...entry, semanticScore, score: semanticScore };
      })
      .filter((entry) => entry.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  return (filtered.length > 0 ? filtered : scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function storeSearchMemoryFromAnswer(
  userId: string,
  query: string,
  answer: string
) {
  const config = getAIConfig();
  if (!config) return;

  const prompt = `Extract one concise memory statement (1 sentence) from this Q&A to store for future reference.
Return JSON: {"memory": "..."}

Q: ${query}
A: ${answer.slice(0, 1500)}`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    if (!response.ok) return;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as { memory?: string };
    if (parsed.memory) {
      await prisma.knowledgeItem.create({
        data: {
          userId,
          title: `Search: ${query.slice(0, 60)}`,
          type: "note",
          category: "Search Memory",
          aiMemory: parsed.memory,
          summary: parsed.memory,
          tags: ["search-memory", "auto-saved"],
        },
      });
    }
  } catch {
    // Non-critical
  }
}
