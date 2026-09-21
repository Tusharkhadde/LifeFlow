import { prisma } from "@/lib/db";

export async function findDuplicateKnowledge(
  userId: string,
  input: { sourceUrl?: string | null; title?: string; content?: string | null }
) {
  if (input.sourceUrl) {
    const byUrl = await prisma.knowledgeItem.findFirst({
      where: { userId, archived: false, sourceUrl: input.sourceUrl },
    });
    if (byUrl) return { duplicate: true, existing: byUrl, reason: "url" as const };
  }

  if (input.title) {
    const normalized = input.title.trim().toLowerCase();
    const items = await prisma.knowledgeItem.findMany({
      where: { userId, archived: false },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    const match = items.find((item) => item.title.trim().toLowerCase() === normalized);
    if (match) return { duplicate: true, existing: match, reason: "title" as const };
  }

  return { duplicate: false as const };
}
