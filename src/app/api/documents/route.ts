import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { processDocumentUpload, extractTextFromImage } from "@/lib/document-ocr";
import { ingestContext } from "@/lib/context-graph";
import { publishAppEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const items = await prisma.knowledgeItem.findMany({
      where: { userId, type: "document", archived: false },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ documents: items });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { text, imageBase64, fileName } = body;

    let rawText = typeof text === "string" ? text.trim() : "";
    if (!rawText && imageBase64) {
      rawText = await extractTextFromImage(imageBase64);
    }

    if (!rawText) {
      return NextResponse.json({ error: "Document text or image is required" }, { status: 400 });
    }

    const { item, extraction } = await processDocumentUpload(
      userId,
      rawText,
      fileName || "web-upload"
    );
    await ingestContext(
      userId,
      `${item.title}. ${item.aiMemory || item.summary || ""}`,
      `document:${item.id}`
    );
    await publishAppEvent(userId, "document_processed", {
      id: item.id,
      title: item.title,
      expiryDate: item.expiryDate,
    });

    return NextResponse.json({ item, extraction }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents error:", error);
    return NextResponse.json({ error: "Failed to process document" }, { status: 500 });
  }
}
