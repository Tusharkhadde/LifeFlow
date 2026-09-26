import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isExaConfigured } from "@/lib/exa-search";
import { getAIConfig } from "@/lib/ai-provider";

export async function GET(request: NextRequest) {
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  const response: Record<string, unknown> = {
    ok: database === "ok",
    service: "lifeflow",
    time: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "development",
  };
  const canSeeDetails =
    Boolean(process.env.CRON_SECRET) &&
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (canSeeDetails) {
    response.checks = {
      database,
      ai: getAIConfig() ? "configured" : "missing",
      exa: isExaConfigured() ? "configured" : "missing",
      telegram: process.env.TELEGRAM_BOT_TOKEN ? "configured" : "missing",
    };
  }
  return NextResponse.json(response);
}
