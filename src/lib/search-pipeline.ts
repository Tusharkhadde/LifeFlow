import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { searchExa, formatExaResultsForPrompt, isExaConfigured, ExaSearchResult } from "@/lib/exa-search";
import {
  hybridSearchKnowledge,
  indexKnowledgeItemEmbedding,
  type ScoredKnowledgeItem,
} from "@/lib/hybrid-search";
import { getPersonalMemoryContext, rememberPersonalFact } from "@/lib/personal-memory";
import { getContextGraph, getRecentContextGraph, ingestContext } from "@/lib/context-graph";
import { getProductivityContext } from "@/lib/productivity-actions";
import { publishAppEvent } from "@/lib/events";
import { saveSearchHistory } from "@/lib/search-history";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildCitations, type Citation } from "@/lib/citations";
import { recordAiUsage, trackedChatCompletion } from "@/lib/ai-telemetry";

export interface SmartSearchResult {
  reply: string;
  matchingItems: ScoredKnowledgeItem[];
  exaResults: ExaSearchResult[];
  sources: string[];
  citations: Citation[];
}

async function storeSearchInsights(
  userId: string,
  query: string,
  answer: string,
  exaResults: ExaSearchResult[]
) {
  const config = getAIConfig();
  if (!config) return;

  const prompt = `Given this user query and synthesized answer, extract 0-3 durable facts worth remembering for future conversations.
Return JSON only:
{
  "memories": [{"key": "short key", "value": "fact value"}],
  "relationships": ["entity A relates to entity B via relation"]
}

Query: ${query}
Answer: ${answer.slice(0, 2000)}
Web sources used: ${exaResults.map((r) => r.title).join(", ") || "none"}`;

  try {
    const { data } = await trackedChatCompletion({
      userId,
      operation: "search_memory_extract",
      modelClass: "fast",
      request: {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      },
    });
    const raw = (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as {
      memories?: Array<{ key: string; value: string }>;
      relationships?: string[];
    };

    for (const memory of parsed.memories || []) {
      if (memory.key && memory.value) {
        await rememberPersonalFact(userId, memory.key.toLowerCase(), memory.value, `search:${query}`);
      }
    }

    for (const relationship of parsed.relationships || []) {
      await ingestContext(userId, relationship, `search:${query}`);
    }

    await ingestContext(userId, `User searched for "${query}" and learned: ${answer.slice(0, 300)}`, "search-memory");
  } catch (error) {
    console.warn("[SearchPipeline] Failed to store search insights:", error);
  }
}

export async function executeSmartSearch(
  userId: string,
  query: string,
  conversationContext = "",
  options: { useExa?: boolean; storeMemory?: boolean; source?: string } = {}
): Promise<SmartSearchResult> {
  const rateCheck = await checkRateLimit(userId, "search");
  if (!rateCheck.allowed) {
    return {
      reply: "You've reached the search rate limit. Please try again in an hour.",
      matchingItems: [],
      exaResults: [],
      sources: [],
      citations: [],
    };
  }

  let useExa = options.useExa !== false && isExaConfigured();
  const storeMemory = options.storeMemory !== false;

  if (useExa) {
    const exaRate = await checkRateLimit(userId, "exa_search");
    if (!exaRate.allowed) useExa = false;
  }

  const [localMatches, exaResponse, personalMemoryContext, graphContext, recentGraphContext, productivityContext] =
    await Promise.all([
      hybridSearchKnowledge(userId, query, 8),
      useExa ? searchExa(query, { numResults: 6, type: "fast" }) : Promise.resolve({ results: [], query }),
      getPersonalMemoryContext(userId),
      getContextGraph(userId, query),
      getRecentContextGraph(userId),
      getProductivityContext(userId),
    ]);

  const exaResults = exaResponse.results;
  if (useExa) {
    void recordAiUsage({
      userId,
      provider: "exa",
      operation: "exa_search",
      model: "fast",
      metadata: { resultCount: exaResults.length },
    });
  }
  const localContext = localMatches
    .map(
      (entry, idx) =>
        `${idx + 1}. **${entry.item.title}** (${entry.item.type}, score: ${entry.score.toFixed(2)})\n   Memory: ${entry.item.aiMemory || entry.item.summary}\n   URL: ${entry.item.sourceUrl || "N/A"}`
    )
    .join("\n\n");

  const exaContext = formatExaResultsForPrompt(exaResults);
  const config = getAIConfig();
  const sources = [
    ...localMatches.map((m) => m.item.sourceUrl).filter(Boolean) as string[],
    ...exaResults.map((r) => r.url),
  ];
  const citations = buildCitations(localMatches, exaResults);

  if (!config) {
    const fallbackParts = [];
    if (localMatches.length) {
      fallbackParts.push(
        "*From your vault:*\n" +
          localMatches
            .map((m) => `• [${m.item.title}](${m.item.sourceUrl || "#"}) — ${m.item.aiMemory || m.item.summary}`)
            .join("\n")
      );
    }
    if (exaResults.length) {
      fallbackParts.push(
        "*From the web (Exa):*\n" +
          exaResults.map((r) => `• [${r.title}](${r.url}) — ${r.snippet.slice(0, 120)}`).join("\n")
      );
    }
    return {
      reply: fallbackParts.join("\n\n") || "No results found. Try saving some links first or configure EXA_API_KEY.",
      matchingItems: localMatches,
      exaResults,
      sources,
      citations,
    };
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const { getPersonaPrompt } = await import("@/lib/personas");
  const personaPrefix = getPersonaPrompt(settings?.aiPersona || "assistant");

  const prompt = `${personaPrefix}

The user asked: "${query}"

Recent conversation:
${conversationContext || "No previous conversation."}

Personal memories:
${personalMemoryContext || "None stored."}

Context graph:
${Array.from(new Set([...graphContext, ...recentGraphContext])).slice(0, 20).join("\n") || "None."}

Current tasks/reminders:
${productivityContext}

=== LOCAL KNOWLEDGE VAULT (searched first) ===
${localContext || "No matching saved items."}

=== WEB SEARCH RESULTS (from Exa.ai — use these for current/external information) ===
${exaContext}

INSTRUCTIONS:
1. Answer using LOCAL vault items first when relevant, then supplement with Exa web results for current/external facts.
2. Never invent facts. Cite sources with markdown links [Title](URL).
3. If Exa found better/current info than the vault, prefer Exa for factual answers but mention saved items if related.
4. Be conversational and concise (Telegram-friendly, under 400 words).
5. End with a brief "Sources" section listing key links used.`;

  try {
    const { data } = await trackedChatCompletion({
      userId,
      operation: "search_synthesis",
      modelClass: "primary",
      cacheTtlSeconds: 300,
      request: {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      },
    });
    const reply =
      (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ||
      "Here's what I found.";

    if (storeMemory) {
      await storeSearchInsights(userId, query, reply, exaResults);
    }

    await saveSearchHistory(userId, query, reply, {
      source: options.source || "telegram",
      exaUsed: exaResults.length > 0,
      sourceUrls: sources,
      citations,
    });
    await publishAppEvent(userId, "search_completed", { query, sourceCount: sources.length });

    let finalReply = reply;
    if (exaResults.length > 0) {
      finalReply += `\n\n💡 _Top result:_ [${exaResults[0].title}](${exaResults[0].url})\nReply /save ${exaResults[0].url} to save to vault.`;
    }

    return {
      reply: finalReply,
      matchingItems: localMatches,
      exaResults,
      sources,
      citations,
    };
  } catch (error) {
    console.error("[SearchPipeline] LLM synthesis error:", error);
    const parts = [];
    if (exaResults.length) {
      parts.push(
        "🌐 *Web results (Exa):*\n" +
          exaResults.map((r) => `• [${r.title}](${r.url})\n  _${r.snippet.slice(0, 100)}_`).join("\n")
      );
    }
    if (localMatches.length) {
      parts.push(
        "🧠 *Your vault:*\n" +
          localMatches.map((m) => `• [${m.item.title}](${m.item.sourceUrl || "#"})`).join("\n")
      );
    }
    return {
      reply: parts.join("\n\n") || "Search failed. Please try again.",
      matchingItems: localMatches,
      exaResults,
      sources,
      citations,
    };
  }
}

export async function saveKnowledgeWithEmbedding(
  userId: string,
  data: {
    title: string;
    summary?: string | null;
    aiMemory?: string | null;
    type: string;
    category: string;
    tags?: unknown;
    sourceUrl?: string | null;
    favicon?: string | null;
    content?: string | null;
    expiryDate?: Date | null;
    extractedAmount?: number | null;
    documentType?: string | null;
    vendor?: string | null;
    metadata?: unknown;
  }
) {
  const item = await prisma.knowledgeItem.create({ data: { userId, ...data } });
  await indexKnowledgeItemEmbedding(item.id);
  await publishAppEvent(userId, "knowledge_saved", { id: item.id, title: item.title, type: item.type });
  return item;
}
