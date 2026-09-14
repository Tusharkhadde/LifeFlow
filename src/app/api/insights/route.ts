import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getDailyInsightSummary } from "@/lib/productivity-actions";
import { getProactiveAlerts } from "@/lib/proactive-intelligence";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const [summary, proactiveAlerts] = await Promise.all([
      getDailyInsightSummary(userId),
      getProactiveAlerts(userId),
    ]);

    const alerts = [
      ...proactiveAlerts.map((a) => a.message),
      ...summary.alerts,
    ];

    const insights = [
      {
        id: "productivity-score",
        type: "score",
        title: "Daily productivity score",
        description: `Your current productivity score is ${summary.productivityScore}/100.`,
        severity: summary.productivityScore >= 75 ? "good" : summary.productivityScore >= 55 ? "info" : "warning",
        dismissed: false,
        createdAt: new Date().toISOString(),
      },
      ...proactiveAlerts.slice(0, 5).map((alert, index) => ({
        id: `proactive-${index}`,
        type: alert.type,
        title: alert.title,
        description: alert.message,
        severity: alert.severity === "high" ? "warning" : alert.severity === "medium" ? "info" : "good",
        dismissed: false,
        createdAt: new Date().toISOString(),
      })),
    ];

    return NextResponse.json({
      summary: summary.summary,
      productivityScore: summary.productivityScore,
      priorities: summary.priorities,
      alerts,
      proactiveAlerts,
      nextActions: summary.nextActions,
      stats: summary.stats,
      insights,
    });
  } catch (error) {
    console.error("GET /api/insights error:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
