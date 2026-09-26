import type { ExaSearchResult } from "@/lib/exa-search";
import type { ScoredKnowledgeItem } from "@/lib/hybrid-search";

export interface Citation {
  id: string;
  kind: "vault" | "web" | "memory" | "graph";
  title: string;
  url?: string;
  snippet?: string;
  score?: number;
  knowledgeItemId?: string;
  publishedDate?: string;
}

export function buildCitations(
  matchingItems: ScoredKnowledgeItem[],
  exaResults: ExaSearchResult[]
): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const entry of matchingItems) {
    const key = entry.item.sourceUrl || `vault:${entry.item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      id: `vault-${entry.item.id}`,
      kind: "vault",
      title: entry.item.title,
      url: entry.item.sourceUrl || undefined,
      snippet: entry.item.aiMemory || entry.item.summary || undefined,
      score: Number(entry.score.toFixed(3)),
      knowledgeItemId: entry.item.id,
    });
  }
  for (const result of exaResults) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    citations.push({
      id: `web-${citations.length + 1}`,
      kind: "web",
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      score: result.score,
      publishedDate: result.publishedDate,
    });
  }
  return citations.slice(0, 14);
}
