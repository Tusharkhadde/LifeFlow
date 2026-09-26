import { prisma } from "@/lib/db";

interface BucketRow {
  count: number;
  resetAt: Date;
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
) {
  const nextReset = new Date(Date.now() + windowMs);
  const [bucket] = await prisma.$queryRaw<BucketRow[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${nextReset}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${nextReset}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count", "resetAt"
  `;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export async function cleanupRateLimitBuckets() {
  return prisma.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: new Date(Date.now() - 86400000) } },
  });
}
