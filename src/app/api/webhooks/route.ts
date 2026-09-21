import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { randomBytes } from "crypto";
import { encryptSecret } from "@/lib/secrets";
import { assertSafeOutboundUrl } from "@/lib/url-guard";
import { writeAuditLog } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const webhooks = await prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        _count: { select: { deliveries: true } },
      },
    });
    return NextResponse.json({ webhooks });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { url, events } = await request.json();
    if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });
    await assertSafeOutboundUrl(url, { httpsOnly: process.env.NODE_ENV === "production" });
    const count = await prisma.webhook.count({ where: { userId, active: true } });
    if (count >= 10) {
      return NextResponse.json({ error: "Maximum 10 active webhooks" }, { status: 429 });
    }

    const secret = randomBytes(24).toString("hex");
    const webhook = await prisma.webhook.create({
      data: {
        userId,
        url,
        events: events || ["knowledge_saved", "expense_created", "search_completed"],
        secret: encryptSecret(secret),
      },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
    await writeAuditLog(userId, "webhook.created", {
      resourceType: "webhook",
      resourceId: webhook.id,
      metadata: { url },
    });
    return NextResponse.json({ webhook: { ...webhook, secret } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      await prisma.webhook.deleteMany({ where: { id, userId } });
      await writeAuditLog(userId, "webhook.deleted", {
        resourceType: "webhook",
        resourceId: id,
      });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
