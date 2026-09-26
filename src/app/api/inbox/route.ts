import { InboxStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import {
  acceptInboxItem,
  bulkTriage,
  createInboxItem,
  dismissInboxItem,
  getInboxSummary,
  listInbox,
  snoozeInboxItem,
} from "@/lib/inbox-actions";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const params = new URL(request.url).searchParams;
    const rawStatus = params.get("status")?.toUpperCase();
    const status = rawStatus && Object.values(InboxStatus).includes(rawStatus as InboxStatus)
      ? (rawStatus as InboxStatus)
      : undefined;
    const [items, summary] = await Promise.all([
      listInbox(userId, {
        status,
        source: params.get("source") || undefined,
        projectId: params.get("projectId") || undefined,
        limit: Number(params.get("limit")) || 100,
      }),
      getInboxSummary(userId),
    ]);
    return NextResponse.json({ items, summary });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (!body.kind || !body.title) {
      return NextResponse.json({ error: "kind and title are required" }, { status: 400 });
    }
    const item = await createInboxItem(userId, {
      source: body.source || "web",
      sourceRef: body.sourceRef,
      kind: body.kind,
      title: body.title,
      summary: body.summary,
      payload: body.payload,
      priority: body.priority,
      projectId: body.projectId,
      forceReview: true,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (body.action === "bulk") {
      if (!Array.isArray(body.ids) || !["accept", "dismiss"].includes(body.bulkAction)) {
        return NextResponse.json({ error: "ids and bulkAction are required" }, { status: 400 });
      }
      return NextResponse.json({
        results: await bulkTriage(userId, body.ids, body.bulkAction, body.projectId),
      });
    }
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (body.action === "accept") {
      return NextResponse.json({
        success: true,
        target: await acceptInboxItem(userId, body.id, body.projectId),
      });
    }
    if (body.action === "dismiss") {
      await dismissInboxItem(userId, body.id);
      return NextResponse.json({ success: true });
    }
    if (body.action === "snooze") {
      const until = new Date(body.until || Date.now() + 86400000);
      await snoozeInboxItem(userId, body.id, until);
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
