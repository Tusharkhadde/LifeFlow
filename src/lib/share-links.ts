import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

export async function createShareLink(userId: string, knowledgeItemId: string) {
  const item = await prisma.knowledgeItem.findFirst({
    where: { id: knowledgeItemId, userId, archived: false },
  });
  if (!item) throw new Error("Knowledge item not found");

  const existing = await prisma.shareLink.findFirst({
    where: { userId, knowledgeItemId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.shareLink.create({
    data: {
      userId,
      knowledgeItemId,
      token: randomBytes(18).toString("base64url"),
    },
  });
}

export async function listShareLinks(userId: string) {
  return prisma.shareLink.findMany({
    where: { userId },
    include: { knowledgeItem: { select: { id: true, title: true, type: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeShareLink(userId: string, id: string) {
  return prisma.shareLink.deleteMany({ where: { id, userId } });
}

export async function getPublicShare(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      knowledgeItem: true,
      user: { select: { name: true } },
    },
  });
  if (!link) return null;
  if (link.expiresAt && link.expiresAt < new Date()) return null;

  await prisma.shareLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 } },
  });

  return {
    title: link.knowledgeItem.title,
    summary: link.knowledgeItem.summary,
    aiMemory: link.knowledgeItem.aiMemory,
    type: link.knowledgeItem.type,
    category: link.knowledgeItem.category,
    tags: link.knowledgeItem.tags,
    sourceUrl: link.knowledgeItem.sourceUrl,
    sharedBy: link.user.name || "LifeFlow user",
    viewCount: link.viewCount + 1,
    createdAt: link.createdAt,
  };
}
