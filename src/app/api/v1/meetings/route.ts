import { NextRequest } from "next/server";
import { listMeetings, processMeetingTranscript } from "@/lib/meeting-intelligence";
import { v1Error, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export const maxDuration = 60;

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "vault:read");
    return v1Json({ meetings: await listMeetings(userId) });
  } catch {
    return v1Error("Unauthorized");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "meetings:write");
    const body = await request.json();
    if (!body.transcript?.trim()) return v1Error("transcript is required", 400);
    const result = await processMeetingTranscript(userId, body.transcript, { title: body.title, source: "api" });
    return v1Json({ result }, 201);
  } catch (error) {
    return v1Error(error instanceof Error ? error.message : "Meeting processing failed", 400);
  }
}
