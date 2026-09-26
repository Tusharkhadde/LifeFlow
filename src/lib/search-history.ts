import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Citation } from "@/lib/citations";

export async function saveSearchHistory(
  userId: string,
  query: string,
  answer: string,
  options: { source?: string; exaUsed?: boolean; sourceUrls?: string[]; citations?: Citation[] } = {}
) {
  return prisma.searchHistory.create({
    data: {
      userId,
      query,
      answer: answer.slice(0, 10000),
      source: options.source || "telegram",
      exaUsed: options.exaUsed ?? false,
      sourceUrls: options.sourceUrls || [],
      citations: (options.citations || []) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function listSearchHistory(userId: string, limit = 30) {
  return prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
