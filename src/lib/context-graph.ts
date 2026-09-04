import { prisma } from "@/lib/db";

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