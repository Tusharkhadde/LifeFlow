import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { forgetPersonalMemory, listPersonalMemories, rememberPersonalFact } from "@/lib/personal-memory";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const memories = await listPersonalMemories(userId);
    return NextResponse.json({ memories });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (!body.key?.trim() || !body.value?.trim()) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }
    const memory = await rememberPersonalFact(userId, body.key.trim().toLowerCase(), body.value.trim(), "web");
    return NextResponse.json({ memory }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save memory" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const query = searchParams.get("query");
    if (id) {
      await prisma.personalMemory.updateMany({
        where: { id, userId },
        data: { archived: true },
      });
      return NextResponse.json({ success: true });
    }
    if (!query) return NextResponse.json({ error: "id or query is required" }, { status: 400 });
    const removed = await forgetPersonalMemory(userId, query);
    return NextResponse.json({ removed });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
