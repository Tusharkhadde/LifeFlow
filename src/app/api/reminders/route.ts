import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const items = await prisma.knowledgeItem.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ reminders: items });
  } catch (error) {
    console.error("GET /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}
