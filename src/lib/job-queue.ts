import { Job, JobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface EnqueueJobOptions {
  userId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  runAfter?: Date;
}

export interface JobExecutionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export async function enqueueJob(
  name: string,
  payload: Record<string, unknown>,
  options: EnqueueJobOptions = {}
) {
  if (options.idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: { idempotencyKey: options.idempotencyKey },
    });
    if (existing) return existing;
  }

  return prisma.job.create({
    data: {
      name,
      userId: options.userId,
      payload: payload as Prisma.InputJsonValue,
      idempotencyKey: options.idempotencyKey,
      maxAttempts: options.maxAttempts || 5,
      runAfter: options.runAfter || new Date(),
    },
  });
}

export async function claimJobs(workerId: string, limit = 5): Promise<Job[]> {
  return prisma.$queryRaw<Job[]>`
    UPDATE "Job"
    SET
      "status" = 'ACTIVE'::"JobStatus",
      "lockedAt" = NOW(),
      "lockedBy" = ${workerId},
      "attempts" = "attempts" + 1,
      "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id"
      FROM "Job"
      WHERE "status" IN ('PENDING'::"JobStatus", 'FAILED'::"JobStatus")
        AND "runAfter" <= NOW()
        AND "attempts" < "maxAttempts"
      ORDER BY "runAfter" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING *
  `;
}

export async function claimUserJob(userId: string, id: string, workerId: string) {
  const claimed = await prisma.job.updateMany({
    where: {
      id,
      userId,
      status: { in: [JobStatus.PENDING, JobStatus.FAILED] },
      runAfter: { lte: new Date() },
      attempts: { lt: 5 },
    },
    data: {
      status: JobStatus.ACTIVE,
      attempts: { increment: 1 },
      lockedAt: new Date(),
      lockedBy: workerId,
    },
  });
  if (!claimed.count) return null;
  return prisma.job.findUnique({ where: { id } });
}

export async function completeJob(jobId: string, result?: unknown) {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      result: result == null ? Prisma.DbNull : (sanitizeJson(result) as Prisma.InputJsonValue),
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

export function jobBackoffMinutes(attempts: number) {
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}

export async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const dead = job.attempts >= job.maxAttempts;
  const backoffMinutes = jobBackoffMinutes(job.attempts);
  logger.error("job.failed", {
    jobId: job.id,
    userId: job.userId || undefined,
    operation: job.name,
    dead,
    error,
  });
  return prisma.job.update({
    where: { id: job.id },
    data: {
      status: dead ? JobStatus.DEAD : JobStatus.FAILED,
      runAfter: new Date(Date.now() + backoffMinutes * 60_000),
      lastError: message.slice(0, 5000),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export async function recoverStaleJobs(staleAfterMinutes = 15) {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000);
  return prisma.job.updateMany({
    where: { status: JobStatus.ACTIVE, lockedAt: { lt: cutoff } },
    data: {
      status: JobStatus.FAILED,
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      lastError: "Recovered stale worker lock",
    },
  });
}

export async function listUserJobs(userId: string, limit = 50) {
  return prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}

export async function retryJob(userId: string, id: string) {
  return prisma.job.updateMany({
    where: { id, userId, status: { in: [JobStatus.FAILED, JobStatus.DEAD] } },
    data: {
      status: JobStatus.PENDING,
      attempts: 0,
      runAfter: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export function sanitizeJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Date) return item.toISOString();
      return item;
    })
  );
}
