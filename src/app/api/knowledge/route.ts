import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { processAndSynthesizeInput } from "@/lib/knowledge-engine";
import { ingestContext } from "@/lib/context-graph";
import { publishAppEvent } from "@/lib/events";
import { findDuplicateKnowledge } from "@/lib/duplicate-detection";
import { enqueueJob } from "@/lib/job-queue";
import { linkToProject } from "@/lib/projects";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const tag = searchParams.get("tag");
    const favorite = searchParams.get("favorite");
    const projectId = searchParams.get("projectId");

    const whereClause: Record<string, unknown> = {
      userId,
      archived: false,
    };

    if (category) whereClause.category = { equals: category, mode: "insensitive" };
    if (favorite === "true") whereClause.favorite = true;
    if (projectId) {
      const links = await prisma.projectLink.findMany({
        where: { userId, projectId, targetType: { in: ["knowledge", "meeting"] } },
        select: { targetId: true },
      });
      whereClause.id = { in: links.map((link) => link.targetId) };
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { aiMemory: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.knowledgeItem.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // Filter by tag if requested
    const filteredItems = tag
      ? items.filter((item) => {
          const tagsArray = (Array.isArray(item.tags) ? item.tags : []) as string[];
          return tagsArray.includes(tag.toLowerCase());
        })
      : items;

    return NextResponse.json({ items: filteredItems });
  } catch (error) {
    console.error("GET /api/knowledge error:", error);
    return NextResponse.json({ error: "Failed to fetch knowledge items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { input, type, projectId } = body;

    if (!input || typeof input !== "string" || !input.trim()) {
      return NextResponse.json({ error: "Input text or URL is required" }, { status: 400 });
    }

    const trimmed = input.trim();
    const isUrl = /^https?:\/\//i.test(trimmed);
    const dup = await findDuplicateKnowledge(userId, { sourceUrl: isUrl ? trimmed : null, title: trimmed.slice(0, 80) });
    if (dup.duplicate) {
      return NextResponse.json({ error: "Duplicate item", existing: dup.existing }, { status: 409 });
    }

    const processed = await processAndSynthesizeInput(trimmed, type);

    const item = await prisma.knowledgeItem.create({
      data: {
        userId,
        title: processed.title,
        summary: processed.summary,
        aiMemory: processed.aiMemory,
        type: processed.type,
        category: processed.category,
        tags: processed.tags,
        sourceUrl: processed.sourceUrl || null,
        favicon: processed.favicon || null,
        content: processed.content || null,
      },
    });
    await ingestContext(userId, `${item.title}. ${item.aiMemory || item.summary || ""}`, item.sourceUrl || input.trim());
    await Promise.all([
      enqueueJob(
        "embedding.index",
        { itemId: item.id },
        { userId, idempotencyKey: `embedding:${item.id}` }
      ),
      enqueueJob(
        "graph.auto_link",
        {
          text: `${item.title}. ${item.summary || ""} ${(item.content || "").slice(0, 1500)}`,
          source: `knowledge:${item.id}`,
          hints: {
            subject: item.title,
            subjectType: item.type === "link" ? "resource" : "note",
            relation: "mentions",
          },
        },
        { userId, idempotencyKey: `graph:knowledge:${item.id}` }
      ),
    ]);
    if (projectId) await linkToProject(userId, projectId, "knowledge", item.id);
    await publishAppEvent(userId, "knowledge_saved", { id: item.id, title: item.title });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("POST /api/knowledge error:", error);
    return NextResponse.json({ error: "Failed to create knowledge item" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { id, favorite, archived, title, category } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const updated = await prisma.knowledgeItem.updateMany({
      where: { id, userId },
      data: {
        ...(favorite !== undefined ? { favorite } : {}),
        ...(archived !== undefined ? { archived } : {}),
        ...(title ? { title } : {}),
        ...(category ? { category } : {}),
      },
    });

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("PATCH /api/knowledge error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.knowledgeItem.deleteMany({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/knowledge error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
