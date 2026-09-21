import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { runAssistant, type AssistantMessage } from "@/lib/assistant-agent";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getAuthenticatedUserId(request.headers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const input = String(body.message || body.question || "").trim();
  const history = Array.isArray(body.history) ? (body.history as AssistantMessage[]) : [];
  if (!input) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runAssistant(userId, history, input)) send(event);
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Assistant failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
