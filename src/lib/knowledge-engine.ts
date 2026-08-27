import { scrapeWebPage } from "@/lib/web-scraper";
import { prisma } from "@/lib/db";

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

  const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.OPENAI_MODEL || "google/gemma-4-26b-a4b-it:free";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
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
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow Knowledge Engine",
      },
      body: JSON.stringify({
        model,
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

export async function queryKnowledgeVault(userId: string, query: string, conversationContext = "") {
  const allItems = await prisma.knowledgeItem.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "desc" },
  });

  const apiKey = process.env.OPENAI_API_KEY;

  if (allItems.length === 0 && !apiKey) {
    return {
      reply: "Your Knowledge Vault is currently empty. Try saving some notes or web links first!",
      matchingItems: [],
    };
  }

  const qLower = query.toLowerCase();
  const queryWords = qLower.split(/\s+/).filter((w) => w.length > 2);

  // Score matching items
  const scoredItems = allItems.map((item) => {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const memoryLower = (item.aiMemory || "").toLowerCase();
    const summaryLower = (item.summary || "").toLowerCase();
    const categoryLower = item.category.toLowerCase();
    const tagsArray = (Array.isArray(item.tags) ? item.tags : []) as string[];
    const tagsStr = tagsArray.join(" ").toLowerCase();

    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 5;
      if (tagsStr.includes(word)) score += 4;
      if (memoryLower.includes(word)) score += 3;
      if (categoryLower.includes(word)) score += 2;
      if (summaryLower.includes(word)) score += 1;
    }

    return { item, score };
  });

  const matching = scoredItems
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((e) => e.item);

  // If no match found by score, return latest items for LLM context
  const contextItems = matching.length > 0 ? matching.slice(0, 5) : allItems.slice(0, 5);

  const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.OPENAI_MODEL || "google/gemma-4-26b-a4b-it:free";
  const itemFormattedContext = contextItems
    .map(
      (it, idx) =>
        `${idx + 1}. **${it.title}** (${it.type})\n   Memory: ${it.aiMemory || it.summary}\n   URL: ${it.sourceUrl || "N/A"}\n   Tags: ${(Array.isArray(it.tags) ? it.tags : []).join(", ")}`
    )
    .join("\n\n");

  if (!apiKey) {
    const listResponse = contextItems
      .map((it) => `• [${it.title}](${it.sourceUrl || "#"}) — ${it.aiMemory || it.summary}`)
      .join("\n");
    return {
      reply: `Found matching items for "${query}":\n\n${listResponse}`,
      matchingItems: contextItems,
    };
  }

  const prompt = `You are LifeFlow AI Second Brain Assistant.
The user is asking: "${query}"

Recent conversation history (use it to resolve references such as "that", "it", or "the one I mentioned"):
${conversationContext || "No previous conversation."}

Here are the user's saved items in their Second Brain:
${itemFormattedContext || "No saved items matched or exist yet."}

Formulate a helpful, conversational, human-like response. Use the conversation history and saved items as context, but never invent facts. Always include the item titles and their clickable URLs (e.g. [Title](URL)) if available.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lifeflow-ai.vercel.app",
        "X-OpenRouter-Title": "LifeFlow Knowledge Assistant",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!response.ok) throw new Error("LLM API error");

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Here are your matching saved items:";
    return { reply, matchingItems: contextItems };
  } catch (err) {
    console.error("[KnowledgeEngine] Query error:", err);
    const listResponse = contextItems
      .map((it) => `• [${it.title}](${it.sourceUrl || "#"}) — ${it.aiMemory || it.summary}`)
      .join("\n");
    return {
      reply: `Here are your relevant saved items:\n\n${listResponse}`,
      matchingItems: contextItems,
    };
  }
}
