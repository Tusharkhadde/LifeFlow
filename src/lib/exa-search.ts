export interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  score?: number;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
  query: string;
}

function getExaApiKey(): string | null {
  return process.env.EXA_API_KEY || null;
}

export function isExaConfigured(): boolean {
  return Boolean(getExaApiKey());
}

export async function searchExa(
  query: string,
  options?: { numResults?: number; type?: "auto" | "fast" | "instant" }
): Promise<ExaSearchResponse> {
  const apiKey = getExaApiKey();
  if (!apiKey) {
    return { results: [], query };
  }

  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: options?.type || "auto",
        numResults: options?.numResults || 6,
        contents: {
          highlights: { numSentences: 3, highlightsPerUrl: 2 },
          text: { maxCharacters: 1200 },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Exa Search] API error:", response.status, errorText);
      return { results: [], query };
    }

    const data = await response.json();
    const rawResults = (data.results || []) as Array<{
      title?: string;
      url?: string;
      publishedDate?: string;
      score?: number;
      highlights?: string[];
      text?: string;
    }>;

    const results: ExaSearchResult[] = rawResults.map((item) => ({
      title: item.title || item.url || "Untitled",
      url: item.url || "",
      snippet:
        (item.highlights && item.highlights.length > 0
          ? item.highlights.join(" ")
          : item.text?.slice(0, 500)) || "",
      publishedDate: item.publishedDate,
      score: item.score,
    }));

    return { results: results.filter((r) => r.url), query };
  } catch (error) {
    console.error("[Exa Search] Request failed:", error);
    return { results: [], query };
  }
}

export function formatExaResultsForPrompt(results: ExaSearchResult[]): string {
  if (results.length === 0) return "No web search results found.";

  return results
    .map(
      (result, index) =>
        `${index + 1}. **${result.title}**\n   URL: ${result.url}\n   Snippet: ${result.snippet}${result.publishedDate ? `\n   Published: ${result.publishedDate}` : ""}`
    )
    .join("\n\n");
}
