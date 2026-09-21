import { getAIConfig } from "@/lib/ai-provider";

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || process.env.HF_EMBEDDING_MODEL || "text-embedding-3-small";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const config = getAIConfig();
  if (!config || !text.trim()) return null;

  try {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      console.warn("[Embeddings] API unavailable:", response.status);
      return null;
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding as number[] | undefined;
    return embedding && Array.isArray(embedding) ? embedding : null;
  } catch (error) {
    console.warn("[Embeddings] Generation failed:", error);
    return null;
  }
}

export function buildSearchableText(parts: {
  title: string;
  summary?: string | null;
  aiMemory?: string | null;
  content?: string | null;
  tags?: unknown;
}): string {
  const tags = Array.isArray(parts.tags) ? (parts.tags as string[]).join(" ") : "";
  return [parts.title, parts.summary, parts.aiMemory, tags, parts.content?.slice(0, 500)]
    .filter(Boolean)
    .join("\n");
}

export function parseStoredEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value.filter((v): v is number => typeof v === "number");
  return nums.length === value.length ? nums : null;
}
