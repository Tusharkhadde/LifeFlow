import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { createShareLink, listShareLinks, revokeShareLink } from "@/lib/share-links";
import { getAppBaseUrl } from "@/lib/integrations/oauth-state";
import { publishAppEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const links = await listShareLinks(userId);
    const base = getAppBaseUrl();
    return NextResponse.json({
      links: links.map((link) => ({
        ...link,
        url: `${base}/s/${link.token}`,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (!body.knowledgeItemId) {
      return NextResponse.json({ error: "knowledgeItemId is required" }, { status: 400 });
    }
    const link = await createShareLink(userId, body.knowledgeItemId);
    const url = `${getAppBaseUrl()}/s/${link.token}`;
    await publishAppEvent(userId, "share_created", { id: link.id, title: "Knowledge share link" });
    return NextResponse.json({ link: { ...link, url } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create share link" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });
    await revokeShareLink(userId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
