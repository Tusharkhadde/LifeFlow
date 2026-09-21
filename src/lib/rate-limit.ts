import { prisma } from "@/lib/db";

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  search: { max: 30, windowMs: 3600000 },
  exa_search: { max: 20, windowMs: 3600000 },
  ai_chat: { max: 50, windowMs: 3600000 },
};

export async function checkRateLimit(userId: string, action: string): Promise<{ allowed: boolean; remaining: number }> {
  const limit = LIMITS[action] || { max: 100, windowMs: 3600000 };
  const since = new Date(Date.now() - limit.windowMs);

  const count = await prisma.usageLog.count({
    where: { userId, action, createdAt: { gte: since } },
  });

  if (count >= limit.max) {
    return { allowed: false, remaining: 0 };
  }

  await prisma.usageLog.create({ data: { userId, action } });
  return { allowed: true, remaining: limit.max - count - 1 };
}
