import { prisma } from "@/lib/db";

const COLLECTION_RULES: Array<{ name: string; color: string; match: RegExp }> = [
  { name: "Development", color: "#3b82f6", match: /react|next|typescript|api|backend|frontend|code|dev/i },
  { name: "Finance", color: "#10b981", match: /finance|money|budget|expense|bill|invoice|tax/i },
  { name: "Health", color: "#ef4444", match: /health|medicine|doctor|fitness|gym|diet/i },
  { name: "Learning", color: "#8b5cf6", match: /course|learn|tutorial|book|study|education/i },
  { name: "Design", color: "#f59e0b", match: /design|ui|ux|figma|css|tailwind/i },
];

export async function autoOrganizeCollections(userId: string) {
  const items = await prisma.knowledgeItem.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const collections: Record<string, string[]> = {};

  for (const item of items) {
    const text = `${item.title} ${item.category} ${item.aiMemory || ""} ${JSON.stringify(item.tags || [])}`;
    for (const rule of COLLECTION_RULES) {
      if (rule.match.test(text)) {
        if (!collections[rule.name]) collections[rule.name] = [];
        collections[rule.name].push(item.id);
        break;
      }
    }
  }

  for (const [name, itemIds] of Object.entries(collections)) {
    const rule = COLLECTION_RULES.find((r) => r.name === name);
    await prisma.collection.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name, color: rule?.color || "#6366f1", itemIds, auto: true },
      update: { itemIds, auto: true },
    });
  }

  return Object.keys(collections).length;
}

export async function listCollections(userId: string) {
  return prisma.collection.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createCollection(userId: string, name: string, color?: string) {
  return prisma.collection.create({
    data: {
      userId,
      name: name.trim(),
      color: color || "#6366f1",
      itemIds: [],
    },
  });
}

export async function addItemToCollection(userId: string, collectionId: string, itemId: string) {
  const collection = await prisma.collection.findFirst({ where: { id: collectionId, userId } });
  if (!collection) throw new Error("Collection not found");
  const itemIds = Array.isArray(collection.itemIds) ? (collection.itemIds as string[]) : [];
  if (!itemIds.includes(itemId)) itemIds.push(itemId);
  return prisma.collection.update({
    where: { id: collection.id },
    data: { itemIds },
  });
}

export async function deleteCollection(userId: string, id: string) {
  return prisma.collection.deleteMany({ where: { id, userId } });
}

export async function getCollectionItems(userId: string, collectionId: string) {
  const collection = await prisma.collection.findFirst({ where: { id: collectionId, userId } });
  if (!collection) return { collection: null, items: [] };
  const ids = Array.isArray(collection.itemIds) ? (collection.itemIds as string[]) : [];
  const items = ids.length
    ? await prisma.knowledgeItem.findMany({
        where: { userId, id: { in: ids }, archived: false },
      })
    : [];
  return { collection, items };
}
