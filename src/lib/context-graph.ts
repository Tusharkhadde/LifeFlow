import { prisma } from "@/lib/db";
import { trackedChatCompletion } from "@/lib/ai-telemetry";

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ").slice(0, 120);
}

async function entity(userId: string, name: string, type = "concept") {
  const cleanName = name.trim().replace(/[.!?,]+$/, "").slice(0, 120);
  const normalized = normalize(cleanName);
  if (!normalized || normalized.length < 2) return null;
  return prisma.contextEntity.upsert({
    where: { userId_normalized: { userId, normalized } },
    create: { userId, name: cleanName, normalized, type },
    update: { name: cleanName, type },
  });
}

async function relation(userId: string, from: string, to: string, relationName: string, source: string) {
  const [fromEntity, toEntity] = await Promise.all([entity(userId, from), entity(userId, to)]);
  if (!fromEntity || !toEntity || fromEntity.id === toEntity.id) return;
  await prisma.contextRelation.upsert({
    where: { fromEntityId_toEntityId_relation: { fromEntityId: fromEntity.id, toEntityId: toEntity.id, relation: relationName } },
    create: { userId, fromEntityId: fromEntity.id, toEntityId: toEntity.id, relation: relationName, source: source.slice(0, 500) },
    update: { source: source.slice(0, 500) },
  });
}

export async function ingestContext(userId: string, text: string, source = text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  const sentences = cleanText.split(/[.!?\n]+/).map((sentence) => sentence.trim()).filter(Boolean).slice(0, 12);
  for (const sentence of sentences) {
    const projectMatch = sentence.match(/(.+?)\s+(?:is|for|belongs to|relates to)\s+(.+)/i);
    if (projectMatch) {
      await relation(userId, projectMatch[1], projectMatch[2], "related_to", source);
      continue;
    }
    const aboutMatch = sentence.match(/(?:about|regarding)\s+(.+)/i);
    if (aboutMatch) await entity(userId, aboutMatch[1], "topic");
  }
}

export interface GraphLinkInput {
  entities?: Array<{ name: string; type?: string }>;
  relations?: Array<{ from: string; to: string; relation: string }>;
}

export async function linkEntities(userId: string, input: GraphLinkInput, source: string) {
  for (const item of input.entities || []) {
    if (item.name) {
      const contextEntity = await entity(userId, item.name, item.type || "concept");
      if (contextEntity && item.type === "project") {
        await prisma.project.upsert({
          where: { userId_name: { userId, name: item.name.trim().slice(0, 120) } },
          create: {
            userId,
            name: item.name.trim().slice(0, 120),
            entityId: contextEntity.id,
            metadata: { discoveredFrom: source },
          },
          update: { entityId: contextEntity.id, status: "active" },
        });
      }
    }
  }
  for (const edge of input.relations || []) {
    if (edge.from && edge.to) {
      await relation(userId, edge.from, edge.to, (edge.relation || "related_to").replace(/\s+/g, "_").toLowerCase(), source);
    }
  }
}

function heuristicEntities(text: string): GraphLinkInput {
  const entities: GraphLinkInput["entities"] = [];
  const seen = new Set<string>();
  const capitalized = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\b/g) || [];
  for (const candidate of capitalized) {
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized) || /^(The|This|That|I|We|You|It|My|Our|Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(candidate)) continue;
    seen.add(normalized);
    entities.push({ name: candidate, type: "topic" });
    if (entities.length >= 8) break;
  }
  for (const mention of text.match(/@([a-zA-Z0-9_]{2,30})/g) || []) {
    entities.push({ name: mention.slice(1), type: "person" });
  }
  return { entities };
}

/**
 * Auto-linked life graph: extract people, projects, merchants, and topics from any
 * text the user produces and connect them. Uses the LLM when available, falls back
 * to heuristics. Designed to run as a fire-and-forget side effect.
 */
export async function autoLinkGraph(
  userId: string,
  text: string,
  source: string,
  hints: { subject?: string; relation?: string; subjectType?: string } = {}
) {
  const cleanText = text.trim().slice(0, 4000);
  if (!cleanText) return;

  let extracted: GraphLinkInput | null = null;
  const { getAIConfig } = await import("@/lib/ai-provider");
  const config = getAIConfig();

  if (config && cleanText.length > 40) {
    try {
      const { data } = await trackedChatCompletion({
        userId,
        operation: "graph_extract",
        modelClass: "fast",
        cacheTtlSeconds: 30 * 86400,
        request: {
          temperature: 0,
          messages: [
            {
              role: "user",
              content: `Extract a small knowledge graph from this text. Return JSON only:
{"entities":[{"name":"...","type":"person|project|company|merchant|topic|place|tool"}],"relations":[{"from":"...","to":"...","relation":"works_on|mentions|owes|meets|uses|spent_at|belongs_to|related_to"}]}
Max 8 entities, 8 relations. Use short canonical names.

Text:
${cleanText}`,
            },
          ],
        },
      });
      const raw = (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]) as GraphLinkInput;
    } catch {
      extracted = null;
    }
  }

  if (!extracted) extracted = heuristicEntities(cleanText);

  if (hints.subject) {
    extracted.entities = [...(extracted.entities || []), { name: hints.subject, type: hints.subjectType || "concept" }];
    extracted.relations = [
      ...(extracted.relations || []),
      ...(extracted.entities || [])
        .filter((item) => item.name && item.name !== hints.subject)
        .slice(0, 6)
        .map((item) => ({ from: hints.subject as string, to: item.name, relation: hints.relation || "mentions" })),
    ];
  }

  await linkEntities(userId, extracted, source).catch((error) => {
    console.warn("[ContextGraph] autoLinkGraph failed:", error);
  });
}

export async function getContextGraph(userId: string, query: string) {
  const words = normalize(query).split(" ").filter((word) => word.length > 2);
  if (!words.length) return [];
  const entities = await prisma.contextEntity.findMany({
    where: { userId, OR: words.map((word) => ({ normalized: { contains: word } })) },
    include: { outgoing: { include: { toEntity: true } }, incoming: { include: { fromEntity: true } } },
    take: 12,
  });
  return entities.flatMap((item) => [
    ...item.outgoing.map((edge) => `${item.name} ${edge.relation.replace("_", " ")} ${edge.toEntity.name}`),
    ...item.incoming.map((edge) => `${edge.fromEntity.name} ${edge.relation.replace("_", " ")} ${item.name}`),
  ]).slice(0, 20);
}

export async function listContextGraph(userId: string) {
  return prisma.contextRelation.findMany({
    where: { userId },
    include: { fromEntity: true, toEntity: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getRecentContextGraph(userId: string) {
  const relations = await prisma.contextRelation.findMany({
    where: { userId },
    include: { fromEntity: true, toEntity: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return relations.map((edge) => `${edge.fromEntity.name} ${edge.relation.replace("_", " ")} ${edge.toEntity.name}`);
}