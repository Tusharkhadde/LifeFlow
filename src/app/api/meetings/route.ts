import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { listMeetings } from "@/lib/meeting-intelligence";
import { enqueueJob } from "@/lib/job-queue";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const meetings = await listMeetings(userId);
    return NextResponse.json({ meetings });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Meeting upload exceeds the 20 MB limit" }, { status: 413 });
    }
    const body = await request.json();
    const { transcript, audioBase64, fileName, title } = body as {
      transcript?: string;
      audioBase64?: string;
      fileName?: string;
      title?: string;
    };

    if (audioBase64) {
      const encoded = audioBase64.replace(/^data:[^;]+;base64,/, "");
      if (Math.floor(encoded.length * 0.75) > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Audio exceeds the 15 MB limit" }, { status: 413 });
      }
      if (
        fileName &&
        !/\.(mp3|m4a|wav|ogg|webm|mp4)$/i.test(fileName)
      ) {
        return NextResponse.json({ error: "Unsupported audio file type" }, { status: 415 });
      }
      const contentHash = Buffer.from(encoded.slice(0, 300)).toString("base64url").slice(0, 40);
      const job = await enqueueJob(
        "meeting.audio",
        { audioBase64: encoded, title, fileName, source: "web-audio" },
        { userId, idempotencyKey: `meeting-audio:${userId}:${contentHash}`, maxAttempts: 3 }
      );
      return NextResponse.json({ queued: true, job }, { status: 202 });
    }

    if (!transcript?.trim()) {
      return NextResponse.json({ error: "transcript or audioBase64 is required" }, { status: 400 });
    }
    if (transcript.length > 100_000) {
      return NextResponse.json({ error: "Transcript exceeds 100,000 characters" }, { status: 413 });
    }

    const contentHash = Buffer.from(transcript.slice(0, 500)).toString("base64url").slice(0, 40);
    const job = await enqueueJob(
      "meeting.process",
      { transcript, title, source: "web" },
      { userId, idempotencyKey: `meeting:${userId}:${contentHash}`, maxAttempts: 3 }
    );
    return NextResponse.json({ queued: true, job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meeting processing failed" },
      { status: 400 }
    );
  }
}
