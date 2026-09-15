import { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getRecentAppEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastCheck = new Date();

        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: "connected", userId });

        const interval = setInterval(async () => {
          try {
            const events = await getRecentAppEvents(userId, lastCheck);
            for (const event of events) {
              send({ type: event.type, payload: event.payload, createdAt: event.createdAt });
              lastCheck = event.createdAt;
            }
            send({ type: "heartbeat", at: new Date().toISOString() });
          } catch {
            clearInterval(interval);
            controller.close();
          }
        }, 3000);

        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
