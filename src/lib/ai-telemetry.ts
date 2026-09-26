import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";

interface ChatRequest {
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  [key: string]: unknown;
}

interface TrackedChatOptions {
  userId: string;
  operation: string;
  request: ChatRequest;
  modelClass?: "primary" | "fast";
  cacheTtlSeconds?: number;
  requestId?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
}

function providerName(baseUrl: string) {
  if (baseUrl.includes("openrouter")) return "openrouter";
  if (baseUrl.includes("huggingface")) return "huggingface";
  if (baseUrl.includes("tokenrouter")) return "tokenrouter";
  if (baseUrl.includes("openai")) return "openai";
  return "openai-compatible";
}

function estimateCost(inputTokens = 0, outputTokens = 0) {
  const inputPerMillion = Number(process.env.AI_INPUT_COST_PER_MILLION_USD || 0);
  const outputPerMillion = Number(process.env.AI_OUTPUT_COST_PER_MILLION_USD || 0);
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

async function resolveModel(userId: string, modelClass: "primary" | "fast") {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (modelClass === "fast") {
    return settings?.preferredFastModel || process.env.OPENAI_FAST_MODEL || process.env.HF_MODEL || process.env.OPENAI_MODEL;
  }
  return process.env.HF_MODEL || process.env.OPENAI_MODEL;
}

export async function getMonthlyAiSpend(userId: string) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const aggregate = await prisma.aiUsageLog.aggregate({
    where: { userId, createdAt: { gte: since } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    _count: { id: true },
  });
  return {
    costUsd: aggregate._sum.costUsd || 0,
    inputTokens: aggregate._sum.inputTokens || 0,
    outputTokens: aggregate._sum.outputTokens || 0,
    calls: aggregate._count.id,
  };
}

async function enforceBudget(userId: string) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.monthlyAiBudgetUsd) return;
  const spend = await getMonthlyAiSpend(userId);
  if (spend.costUsd >= settings.monthlyAiBudgetUsd) {
    throw new Error("Monthly AI budget reached. Increase it in Settings or wait for next month.");
  }
}

export async function recordAiUsage(data: {
  userId: string;
  provider: string;
  operation: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  requestId?: string;
  jobId?: string;
  cacheHit?: boolean;
  metadata?: Record<string, unknown>;
}) {
  return prisma.aiUsageLog.create({
    data: {
      ...data,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
  }).catch(() => null);
}

export async function trackedChatCompletion(options: TrackedChatOptions) {
  await enforceBudget(options.userId);
  const modelOverride = await resolveModel(options.userId, options.modelClass || "primary");
  const config = getAIConfig(modelOverride);
  if (!config) throw new Error("AI provider not configured");

  const request = { ...options.request, model: config.model, stream: false };
  const cacheKey = options.cacheTtlSeconds
    ? createHash("sha256")
        .update(JSON.stringify({ userId: options.userId, operation: options.operation, request }))
        .digest("hex")
    : null;
  if (cacheKey) {
    const cached = await prisma.aiCache.findFirst({
      where: { key: cacheKey, expiresAt: { gt: new Date() } },
    });
    if (cached) {
      await Promise.all([
        prisma.aiCache.update({ where: { id: cached.id }, data: { hitCount: { increment: 1 } } }),
        recordAiUsage({
          userId: options.userId,
          provider: providerName(config.baseUrl),
          operation: options.operation,
          model: config.model,
          cacheHit: true,
          requestId: options.requestId,
          metadata: options.metadata,
        }),
      ]);
      return { data: cached.response as Record<string, unknown>, cacheHit: true, config };
    }
  }

  const started = Date.now();
  let activeConfig = config;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": process.env.BETTER_AUTH_URL || "http://localhost:3000",
        "X-OpenRouter-Title": "LifeFlow AI",
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    logger.error("ai.request_failed", {
      userId: options.userId,
      operation: options.operation,
      error,
    });
    throw error;
  }
  if (!response.ok) {
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL;
    if (fallbackModel && config.model !== fallbackModel && (options.modelClass || "primary") === "primary") {
      const fallback = getAIConfig(fallbackModel);
      if (fallback) {
        const retry = await fetch(`${fallback.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${fallback.apiKey}`,
          },
          body: JSON.stringify({ ...request, model: fallback.model }),
        });
        if (retry.ok) {
          response = retry;
          activeConfig = fallback;
        }
      }
    }
  }
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI request failed (${response.status}): ${error.slice(0, 500)}`);
  }
  const data = (await response.json()) as Record<string, unknown> & {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  };
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const costUsd = Number(data.usage?.cost) || estimateCost(inputTokens, outputTokens);
  await recordAiUsage({
    userId: options.userId,
    provider: providerName(activeConfig.baseUrl),
    operation: options.operation,
    model: activeConfig.model,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs: Date.now() - started,
    requestId: options.requestId,
    jobId: options.jobId,
    metadata: options.metadata,
  });
  if (cacheKey && options.cacheTtlSeconds) {
    await prisma.aiCache.upsert({
      where: { key: cacheKey },
      create: {
        userId: options.userId,
        key: cacheKey,
        operation: options.operation,
        model: activeConfig.model,
        response: data as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + options.cacheTtlSeconds * 1000),
      },
      update: {
        response: data as Prisma.InputJsonValue,
        model: activeConfig.model,
        expiresAt: new Date(Date.now() + options.cacheTtlSeconds * 1000),
      },
    });
  }
  return { data, cacheHit: false, config: activeConfig };
}

export async function cleanupAiCache() {
  return prisma.aiCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
