import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getDailyInsightSummary } from "@/lib/productivity-actions";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const summary = await getDailyInsightSummary(userId);

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
      {
        id: "memory-health",
        type: "knowledge",
        title: "Knowledge vault health",
        description: `You have ${summary.stats.savedKnowledge} saved knowledge items available for search and recall.`,
        severity: summary.stats.savedKnowledge > 0 ? "good" : "info",
        dismissed: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "task-priority",
        type: "tasks",
        title: "Priority focus",
        description: summary.priorities[0],
        severity: summary.stats.overdueTasks > 0 ? "warning" : "good",
        dismissed: false,
        createdAt: new Date().toISOString(),
      },
    ];

    return NextResponse.json({
      summary: summary.summary,
      productivityScore: summary.productivityScore,
      priorities: summary.priorities,
      alerts: summary.alerts,
      nextActions: summary.nextActions,
      stats: summary.stats,
      insights,
    });
  } catch (error) {
    console.error("GET /api/insights error:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
