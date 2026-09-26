import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { API_SCOPES, ApiScope, createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";
import { writeAuditLog } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const keys = await listApiKeys(userId);
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json().catch(() => ({}));
    const requestedScopes = Array.isArray(body.scopes) ? body.scopes : ["*"];
    const validScopes = requestedScopes.filter(
      (scope: unknown): scope is ApiScope =>
        scope === "*" || (typeof scope === "string" && API_SCOPES.includes(scope as typeof API_SCOPES[number]))
    );
    if (!validScopes.length) {
      return NextResponse.json({ error: "At least one valid scope is required" }, { status: 400 });
    }
    const key = await createApiKey(userId, body.name || "LifeFlow API key", validScopes);
    await writeAuditLog(userId, "api_key.created", {
      resourceType: "api_key",
      resourceId: key.id,
      metadata: { scopes: validScopes },
    });
    return NextResponse.json({
      key: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        rawKey: key.rawKey,
        createdAt: key.createdAt,
      },
      warning: "Copy this key now. It will not be shown again.",
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });
    await revokeApiKey(userId, id);
    await writeAuditLog(userId, "api_key.revoked", {
      resourceType: "api_key",
      resourceId: id,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
