import { NextRequest } from "next/server";
import { executeSmartSearch } from "@/lib/search-pipeline";
import { v1Error, v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "assistant:use");
    const body = await request.json();
    const query = body.query || body.question;
    if (!query) return v1Error("query is required", 400, request);
    const result = await executeSmartSearch(userId, query, "", { useExa: true, source: "api" });
    return v1Json({
      reply: result.reply,
      sources: result.sources,
      citations: result.citations,
      matchingItems: result.matchingItems.map((item) => ({
        id: item.item.id,
        title: item.item.title,
        score: item.score,
      })),
    }, 200, request);
  } catch (error) {
    return v1Fail(error, request, "Search failed");
  }
}
