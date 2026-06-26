import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const insights = await prisma.insight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ insights });
  } catch {
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { type, title, description, severity } = body;

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const insight = await prisma.insight.create({
      data: {
        userId,
        type: type || "general",
        title,
        description,
        severity: severity || "info",
      },
    });

    return NextResponse.json({ insight }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create insight" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, dismissed } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const insight = await prisma.insight.update({
      where: { id },
      data: { dismissed },
    });

    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ error: "Failed to update insight" }, { status: 500 });
  }
}
