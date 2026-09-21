import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { ensureUserSettings } from "@/lib/budgets-goals";
import { AI_PERSONAS } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const settings = await ensureUserSettings(userId);
    return NextResponse.json({ settings, personas: AI_PERSONAS });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const {
      aiPersona,
      voiceBriefingEnabled,
      monthlyBudgetLimit,
      monthlyAiBudgetUsd,
      preferredFastModel,
      triageMode,
      dailyTriageEnabled,
      retentionDays,
      productTourCompletedAt,
    } = await request.json();
    await ensureUserSettings(userId);

    const settings = await prisma.userSettings.update({
      where: { userId },
      data: {
        ...(aiPersona !== undefined ? { aiPersona } : {}),
        ...(voiceBriefingEnabled !== undefined ? { voiceBriefingEnabled } : {}),
        ...(monthlyBudgetLimit !== undefined ? { monthlyBudgetLimit: monthlyBudgetLimit ? Number(monthlyBudgetLimit) : null } : {}),
        ...(monthlyAiBudgetUsd !== undefined
          ? { monthlyAiBudgetUsd: monthlyAiBudgetUsd ? Number(monthlyAiBudgetUsd) : null }
          : {}),
        ...(preferredFastModel !== undefined ? { preferredFastModel: preferredFastModel || null } : {}),
        ...(triageMode !== undefined && ["auto", "review"].includes(triageMode) ? { triageMode } : {}),
        ...(dailyTriageEnabled !== undefined ? { dailyTriageEnabled: Boolean(dailyTriageEnabled) } : {}),
        ...(retentionDays !== undefined
          ? { retentionDays: Math.max(30, Math.min(3650, Number(retentionDays) || 365)) }
          : {}),
        ...(productTourCompletedAt !== undefined
          ? { productTourCompletedAt: productTourCompletedAt ? new Date(productTourCompletedAt) : null }
          : {}),
      },
    });
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
