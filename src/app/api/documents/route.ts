import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { enqueueJob } from "@/lib/job-queue";

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
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Upload exceeds the 10 MB limit" }, { status: 413 });
    }
    const body = await request.json();
    const { text, imageBase64, fileName, mimeType } = body;
    const rawText = typeof text === "string" ? text.trim() : "";
    if (rawText.length > 100_000) {
      return NextResponse.json({ error: "Document text exceeds 100,000 characters" }, { status: 413 });
    }
    if (imageBase64) {
      const estimatedBytes = Math.floor(String(imageBase64).length * 0.75);
      if (estimatedBytes > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Image exceeds the 8 MB limit" }, { status: 413 });
      }
      if (mimeType && !["image/png", "image/jpeg", "image/webp"].includes(String(mimeType))) {
        return NextResponse.json({ error: "Only PNG, JPEG, and WebP images are accepted" }, { status: 415 });
      }
    }
    if (!rawText && !imageBase64) {
      return NextResponse.json({ error: "Document text or image is required" }, { status: 400 });
    }
    const contentHash = Buffer.from(`${fileName || ""}:${rawText.slice(0, 500)}:${String(imageBase64 || "").slice(0, 100)}`).toString("base64url").slice(0, 40);
    const job = await enqueueJob(
      "document.process",
      { text: rawText, imageBase64, fileName: fileName || "web-upload" },
      { userId, idempotencyKey: `document:${userId}:${contentHash}`, maxAttempts: 3 }
    );
    return NextResponse.json({ queued: true, job }, { status: 202 });
  } catch (error) {
    console.error("POST /api/documents error:", error);
    return NextResponse.json({ error: "Failed to process document" }, { status: 500 });
  }
}
