import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/distributed-rate-limit";

export const API_SCOPES = [
  "vault:read",
  "vault:write",
  "tasks:read",
  "tasks:write",
  "expenses:read",
  "expenses:write",
  "assistant:use",
  "meetings:write",
  "morning:run",
] as const;

export type ApiScope = (typeof API_SCOPES)[number] | "*";

export interface ApiKeyAuth {
  userId: string;
  keyId: string;
  scopes: string[];
  remaining: number;
  resetAt: Date;
}

export function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey() {
  const secret = randomBytes(24).toString("hex");
  const rawKey = `lf_live_${secret}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    prefix: rawKey.slice(0, 15),
  };
}

export async function createApiKey(
  userId: string,
  name: string,
  scopes: ApiScope[] = ["*"]
) {
  const generated = generateApiKey();
  const record = await prisma.apiKey.create({
    data: {
      userId,
      name: name.trim() || "Default key",
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      scopes,
    },
  });
  return { ...record, rawKey: generated.rawKey };
}

export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      rateLimitPerHour: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}

export async function revokeApiKey(userId: string, id: string) {
  return prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function hasScope(scopes: string[], required?: string) {
  if (!required || scopes.includes("*") || scopes.includes(required)) return true;
  const [namespace] = required.split(":");
  return scopes.includes(`${namespace}:*`);
}

export async function resolveApiKeyAuth(
  rawKey: string,
  requiredScope?: string
): Promise<ApiKeyAuth | null> {
  if (!rawKey.startsWith("lf_live_")) return null;
  const keyHash = hashApiKey(rawKey);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
  });
  if (!record || record.revokedAt) return null;
  const scopes = Array.isArray(record.scopes) ? (record.scopes as string[]) : [];
  if (!hasScope(scopes, requiredScope)) return null;
  const rate = await consumeRateLimit(
    `api-key:${record.id}`,
    record.rateLimitPerHour,
    60 * 60 * 1000
  );
  if (!rate.allowed) return null;
  if (!record.lastUsedAt || record.lastUsedAt < new Date(Date.now() - 5 * 60 * 1000)) {
    await prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
  }
  return {
    userId: record.userId,
    keyId: record.id,
    scopes,
    remaining: rate.remaining,
    resetAt: rate.resetAt,
  };
}

export async function resolveApiKey(rawKey: string, requiredScope?: string) {
  const result = await resolveApiKeyAuth(rawKey, requiredScope);
  return result?.userId || null;
}
