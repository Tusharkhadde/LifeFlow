import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function markIntegrationHealthy(
  userId: string,
  provider: string,
  latencyMs?: number,
  metadata?: Record<string, unknown>
) {
  return prisma.integrationHealth.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      status: "healthy",
      lastSuccessAt: new Date(),
      latencyMs,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
    update: {
      status: "healthy",
      lastSuccessAt: new Date(),
      lastError: null,
      latencyMs,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function markIntegrationFailed(
  userId: string,
  provider: string,
  error: unknown,
  latencyMs?: number
) {
  const message = error instanceof Error ? error.message : String(error);
  return prisma.integrationHealth.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      status: "degraded",
      lastFailureAt: new Date(),
      lastError: message.slice(0, 2000),
      latencyMs,
    },
    update: {
      status: "degraded",
      lastFailureAt: new Date(),
      lastError: message.slice(0, 2000),
      latencyMs,
    },
  });
}

export async function listIntegrationHealth(userId: string) {
  return prisma.integrationHealth.findMany({ where: { userId } });
}
