import { scrapeWebPage } from "@/lib/web-scraper";
import { getAIConfig } from "@/lib/ai-provider";
import { indexKnowledgeItemEmbedding } from "@/lib/hybrid-search";
import { executeSmartSearch } from "@/lib/search-pipeline";

export { indexKnowledgeItemEmbedding } from "@/lib/hybrid-search";

export interface ProcessedKnowledge {
  title: string;
  summary: string;
  aiMemory: string;
  category: string;
  tags: string[];
  type: "link" | "note" | "document" | "audio";
  sourceUrl?: string;
  favicon?: string;
  content?: string;
}

export function isURL(input: string): boolean {
  const trimmed = input.trim();
  if (/\s/.test(trimmed)) return false;
  return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(trimmed);
}

export async function processAndSynthesizeInput(
  rawInput: string,
  forceType?: "link" | "note" | "document" | "audio"
): Promise<ProcessedKnowledge> {
  const isWebUrl = isURL(rawInput);
  let scrapedText = rawInput;
  let sourceUrl: string | undefined = undefined;
  let favicon: string | undefined = undefined;
  let pageTitle = "";
  let pageDesc = "";

  if (isWebUrl) {
    const scraped = await scrapeWebPage(rawInput);
    scrapedText = scraped.cleanedText;
    sourceUrl = scraped.url;
    favicon = scraped.favicon;
    pageTitle = scraped.title;
    pageDesc = scraped.description;
  }

  const config = getAIConfig();

  if (!config) {
    // Fallback if no LLM key
    const inferredTags = generateFallbackTags(rawInput, pageTitle, pageDesc);
    const memory = pageDesc || (pageTitle ? `${pageTitle} - saved link` : rawInput.slice(0, 100));
    return {
      title: pageTitle || rawInput.slice(0, 50),
      summary: pageDesc || rawInput,
      aiMemory: memory,
      category: isWebUrl ? "Web Resource" : "General Note",
      tags: inferredTags,
      type: forceType || (isWebUrl ? "link" : "note"),
      sourceUrl,
      favicon,
      content: scrapedText,
    };
  }

  const prompt = `You are the AI Second Brain Knowledge Engine. Analyze the following content and return JSON matching this exact structure:
{
  "title": "Clear, concise title",
  "summary": "Short 2-sentence summary of the content",
  "aiMemory": "Single 1-sentence crisp memory statement explaining what this resource is and what it's used for (e.g., 'shadcn/ui is a React component library for website building')",
  "category": "One category name (e.g. Development, Design, Productivity, Finance, Article, General)",
  "tags": ["tag1", "tag2", "tag3", "tag4"]
}

Content to analyze:
${isWebUrl ? `Title: ${pageTitle}\nDescription: ${pageDesc}\nURL: ${sourceUrl}\nSnippet: ${scrapedText.slice(0, 1500)}` : rawInput}
`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow Knowledge Engine",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API returned ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawContent);

    return {
      title: parsed.title || pageTitle || "Saved Note",
      summary: parsed.summary || pageDesc || rawInput.slice(0, 150),
      aiMemory: parsed.aiMemory || `${pageTitle || "Saved item"} for quick reference.`,
      category: parsed.category || "General",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: string) => t.toLowerCase()) : ["general"],
      type: forceType || (isWebUrl ? "link" : "note"),
      sourceUrl,
      favicon,
      content: scrapedText,
    };
  } catch (error) {
    console.warn("[KnowledgeEngine] LLM extraction error, using fallback:", error);
    const fallbackTags = generateFallbackTags(rawInput, pageTitle, pageDesc);
    return {
      title: pageTitle || (isWebUrl ? sourceUrl || "Saved Web Link" : rawInput.slice(0, 40)),
      summary: pageDesc || rawInput,
      aiMemory: pageDesc || rawInput.slice(0, 100),
      category: isWebUrl ? "Web Resource" : "General Note",
      tags: fallbackTags,
      type: forceType || (isWebUrl ? "link" : "note"),
      sourceUrl,
      favicon,
      content: scrapedText,
    };
  }
}

function generateFallbackTags(raw: string, title?: string, desc?: string): string[] {
  const combined = `${raw} ${title || ""} ${desc || ""}`.toLowerCase();
  const tags: string[] = [];
  if (/react|next|component|ui|tailwind|css|frontend/i.test(combined)) tags.push("website-building", "ui", "react");
  if (/api|backend|database|postgres|prisma|server/i.test(combined)) tags.push("backend", "developer");
  if (/design|figma|icon|style|font/i.test(combined)) tags.push("design", "assets");
  if (/ai|llm|openai|prompt|gpt|gemini/i.test(combined)) tags.push("ai", "tools");
  if (tags.length === 0) tags.push("general", "bookmark");
  return tags;
}

export async function queryKnowledgeVault(
  userId: string,
  query: string,
  conversationContext = "",
  options: { useExa?: boolean } = {}
) {
  const result = await executeSmartSearch(userId, query, conversationContext, {
    useExa: options.useExa ?? true,
    storeMemory: true,
  });

  return {
    reply: result.reply,
    matchingItems: result.matchingItems.map((entry) => entry.item),
    exaResults: result.exaResults,
    sources: result.sources,
    citations: result.citations,
  };
}
