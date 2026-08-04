import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { queryKnowledgeVault } from "@/lib/knowledge-engine";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { question } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const result = await queryKnowledgeVault(userId, question.trim());
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/knowledge/ask error:", error);
    return NextResponse.json({ error: "Failed to query knowledge vault" }, { status: 500 });
  }
}
