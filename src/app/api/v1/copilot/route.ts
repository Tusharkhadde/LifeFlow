import { NextRequest } from "next/server";
import { getAIConfig } from "@/lib/ai-provider";
import { hybridSearchKnowledge } from "@/lib/hybrid-search";
import { getPersonalMemoryContext } from "@/lib/personal-memory";
import { prisma } from "@/lib/db";
import { v1Error, v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export const maxDuration = 45;

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

/**
 * Browser copilot: given the current page (url, title, text) and an optional question,
 * return what the user already knows about it (vault matches) and a grounded answer.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "assistant:use");
    const body = await request.json();
    const url = String(body.url || "");
    const title = String(body.title || "").slice(0, 200);
    const pageText = String(body.text || "").slice(0, 8000);
    const question = String(body.question || "").trim();

    const searchQuery = question || `${title} ${url}`.trim();
    if (!searchQuery) return v1Error("url, title, or question required", 400, request);

    const [matches, alreadySaved, memory] = await Promise.all([
      hybridSearchKnowledge(userId, searchQuery, 6),
      url ? prisma.knowledgeItem.findFirst({ where: { userId, sourceUrl: url, archived: false }, select: { id: true, title: true } }) : null,
      getPersonalMemoryContext(userId).catch(() => ""),
    ]);

    const related = matches.map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      aiMemory: entry.item.aiMemory,
      sourceUrl: entry.item.sourceUrl,
      score: Number(entry.score.toFixed(2)),
    }));

    const config = getAIConfig();
    let answer = related.length
      ? `You have ${related.length} related item(s) in your vault: ${related.slice(0, 3).map((item) => item.title).join(", ")}.`
      : "Nothing related in your vault yet.";

    if (config) {
      const prompt = `You are LifeFlow's browser copilot. The user is viewing a web page. Answer their question (or summarize the page if none) in under 120 words, then add a short "From your vault" note connecting it to what they already saved, if relevant.

Page title: ${title}
URL: ${url}
Page text:
${pageText || "(not provided)"}

User question: ${question || "(none — summarize and connect to my vault)"}

Related vault items:
${related.map((item) => `- ${item.title}: ${item.aiMemory || ""}`).join("\n") || "(none)"}

What I remember about the user:
${memory || "(nothing)"}`;

      try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.model, temperature: 0.3, messages: [{ role: "user", content: prompt }] }),
        });
        if (response.ok) {
          const data = await response.json();
          answer = data.choices?.[0]?.message?.content?.trim() || answer;
        }
      } catch {
        // keep heuristic answer
      }
    }

    return v1Json(
      { answer, related, alreadySaved: alreadySaved ? { id: alreadySaved.id, title: alreadySaved.title } : null },
      200,
      request
    );
  } catch (error) {
    return v1Fail(error, request, "Copilot failed");
  }
}
