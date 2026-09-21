import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function writeAuditLog(
  userId: string,
  action: string,
  options: {
    actorType?: string;
    actorId?: string;
    resourceType?: string;
    resourceId?: string;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  return prisma.auditLog.create({
    data: {
      userId,
      action,
      actorType: options.actorType || "user",
      actorId: options.actorId,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      requestId: options.requestId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      metadata: options.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listAuditLogs(userId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}
