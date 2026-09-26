import { NextRequest } from "next/server";
import { listMeetings, processMeetingTranscript } from "@/lib/meeting-intelligence";
import { v1Error, v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export const maxDuration = 60;

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "vault:read");
    return v1Json({ meetings: await listMeetings(userId) }, 200, request);
  } catch (error) {
    return v1Fail(error, request, "Failed to list meetings");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "meetings:write");
    const body = await request.json();
    if (!body.transcript?.trim()) return v1Error("transcript is required", 400, request);
    const result = await processMeetingTranscript(userId, body.transcript, { title: body.title, source: "api" });
    return v1Json({ result }, 201, request);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return v1Fail(error, request, "Meeting processing failed");
    }
    return v1Error(error instanceof Error ? error.message : "Meeting processing failed", 400, request);
  }
}
