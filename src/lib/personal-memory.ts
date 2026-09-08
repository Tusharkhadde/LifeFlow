import { prisma } from "@/lib/db";

export async function rememberPersonalFact(userId: string, key: string, value: string, source?: string) {
  return prisma.personalMemory.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value, source },
    update: { value, source, archived: false, confidence: 0.9 },
  });
}

export async function extractPersonalFact(userId: string, text: string) {
  const patterns = [
    { pattern: /^my name is (.+)$/i, key: "name", category: "identity" },
    { pattern: /^i(?:'m| am) working on (.+)$/i, key: "current project", category: "work" },
    { pattern: /^i prefer (.+)$/i, key: "preference", category: "preference" },
    { pattern: /^my (.+?) is (.+)$/i, keyFromMatch: true, category: "personal" },
  ];

  for (const candidate of patterns) {
    const match = text.trim().match(candidate.pattern);
    if (!match) continue;
    const key = candidate.keyFromMatch ? match[1].trim().toLowerCase() : candidate.key;
    const value = candidate.keyFromMatch ? match[2].trim() : match[1].trim();
    return rememberPersonalFact(userId, key, value, text);
  }
  return null;
}

export async function listPersonalMemories(userId: string) {
  return prisma.personalMemory.findMany({
    where: { userId, archived: false },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export async function forgetPersonalMemory(userId: string, query: string) {
  const memories = await prisma.personalMemory.findMany({
    where: { userId, archived: false },
  });
  const matches = memories.filter((memory) =>
    `${memory.key} ${memory.value}`.toLowerCase().includes(query.toLowerCase())
  );
  if (matches.length === 0) return 0;
  await prisma.personalMemory.updateMany({
    where: { id: { in: matches.map((memory) => memory.id) } },
    data: { archived: true },
  });
  return matches.length;
}

export async function getPersonalMemoryContext(userId: string) {
  const memories = await listPersonalMemories(userId);
  return memories.map((memory) => `${memory.key}: ${memory.value}`).join("\n");
}
