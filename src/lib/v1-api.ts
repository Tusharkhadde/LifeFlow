import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

function allowedOrigin(request?: NextRequest) {
  const origin = request?.headers.get("origin");
  if (!origin) return process.env.BETTER_AUTH_URL || "http://localhost:3000";
  if (origin.startsWith("chrome-extension://")) return origin;
  const allowed = new Set(
    [
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      ...(process.env.ALLOWED_API_ORIGINS || "").split(","),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().replace(/\/$/, ""))
  );
  return allowed.has(origin.replace(/\/$/, "")) ? origin : "";
}

export function corsHeaders(request?: NextRequest) {
  const origin = allowedOrigin(request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export function v1Options(request?: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function withV1Auth(request: NextRequest, scope?: string) {
  const userId = await getAuthenticatedUserId(request.headers, scope);
  return userId;
}

export function v1Json(data: unknown, status = 200, request?: NextRequest) {
  return NextResponse.json(data, { status, headers: corsHeaders(request) });
}

export function v1Error(message: string, status = 401, request?: NextRequest) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders(request) });
}
