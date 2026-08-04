import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const totalCount = await prisma.knowledgeItem.count({ where: { userId, archived: false } });
    return NextResponse.json({
      insights: [
        {
          id: "1",
          type: "knowledge",
          title: "Second Brain Active",
          description: `You have ${totalCount} saved knowledge items in your Second Brain vault.`,
          severity: "info",
          dismissed: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    console.error("GET /api/insights error:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
