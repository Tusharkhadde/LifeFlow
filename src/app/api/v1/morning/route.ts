import { NextRequest } from "next/server";
import { runMorningAgent } from "@/lib/morning-agent";
import { v1Error, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await withV1Auth(request, "morning:run");
    const body = await request.json().catch(() => ({}));
    const run = await runMorningAgent(userId, {
      force: Boolean(body.force),
      notifyTelegram: Boolean(body.notifyTelegram),
    });
    return v1Json({ run }, run.reused ? 200 : 201);
  } catch {
    return v1Error("Morning OS failed", 500);
  }
}
