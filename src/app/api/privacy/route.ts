import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/account-deletion";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const [deletion, settings, counts] = await Promise.all([
      prisma.dataDeletionRequest.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userSettings.findUnique({ where: { userId } }),
      Promise.all([
        prisma.integration.count({ where: { userId } }),
        prisma.apiKey.count({ where: { userId, revokedAt: null } }),
        prisma.shareLink.count({ where: { userId } }),
        prisma.webhook.count({ where: { userId } }),
      ]),
    ]);
    return NextResponse.json({
      deletion,
      retentionDays: settings?.retentionDays || 365,
      connected: {
        integrations: counts[0],
        apiKeys: counts[1],
        shareLinks: counts[2],
        webhooks: counts[3],
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (body.action === "request-deletion") {
      return NextResponse.json({ deletion: await requestAccountDeletion(userId, 7) });
    }
    if (body.action === "cancel-deletion") {
      await cancelAccountDeletion(userId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}
