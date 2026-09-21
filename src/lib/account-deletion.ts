import { prisma } from "@/lib/db";
import { deleteIntegration } from "@/lib/integrations/store";
import { writeAuditLog } from "@/lib/audit-log";

export async function requestAccountDeletion(userId: string, delayDays = 7) {
  const existing = await prisma.dataDeletionRequest.findFirst({
    where: { userId, status: "pending" },
  });
  if (existing) return existing;
  const executeAt = new Date(Date.now() + Math.max(1, delayDays) * 86400000);
  const request = await prisma.dataDeletionRequest.create({
    data: { userId, executeAt },
  });
  await writeAuditLog(userId, "account.deletion_requested", {
    resourceType: "user",
    resourceId: userId,
    metadata: { executeAt: executeAt.toISOString() },
  });
  return request;
}

export async function cancelAccountDeletion(userId: string) {
  const result = await prisma.dataDeletionRequest.updateMany({
    where: { userId, status: "pending" },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  if (result.count) {
    await writeAuditLog(userId, "account.deletion_cancelled", {
      resourceType: "user",
      resourceId: userId,
    });
  }
  return result;
}

export async function executeAccountDeletion(userId: string) {
  const integrations = await prisma.integration.findMany({
    where: { userId },
    select: { provider: true },
  });
  for (const integration of integrations) {
    await deleteIntegration(
      userId,
      integration.provider as "google_calendar" | "notion" | "gmail"
    ).catch(() => {});
  }
  await prisma.apiKey.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.shareLink.deleteMany({ where: { userId } });
  await prisma.webhook.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

export async function executeDueDeletionRequests() {
  const requests = await prisma.dataDeletionRequest.findMany({
    where: { status: "pending", executeAt: { lte: new Date() } },
    take: 20,
  });
  const results = [];
  for (const request of requests) {
    try {
      await executeAccountDeletion(request.userId);
      results.push({ id: request.id, ok: true });
    } catch (error) {
      results.push({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "Failed",
      });
    }
  }
  return results;
}
