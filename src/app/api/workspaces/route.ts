import { NextRequest, NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceFeed,
  joinWorkspace,
  removeWorkspaceMember,
  rotateWorkspaceInvite,
  shareWithWorkspace,
  transferWorkspaceOwnership,
  unshareFromWorkspace,
  updateWorkspaceMember,
} from "@/lib/workspace";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const workspaceId = new URL(request.url).searchParams.get("id");

    if (workspaceId) {
      const feed = await getWorkspaceFeed(workspaceId, userId);
      if (!feed) return NextResponse.json({ error: "Not a member" }, { status: 403 });
      return NextResponse.json(feed);
    }

    const memberships = await getUserWorkspaces(userId);
    return NextResponse.json({ workspaces: memberships.map((m) => m.workspace) });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    const { name, inviteCode, action } = body;

    if (action === "join" && inviteCode) {
      const workspace = await joinWorkspace(userId, inviteCode);
      if (!workspace) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
      return NextResponse.json({ workspace });
    }
    if (action === "share") {
      const share = await shareWithWorkspace(
        userId,
        body.workspaceId,
        body.targetType,
        body.targetId,
        body.access
      );
      return NextResponse.json({ share }, { status: 201 });
    }
    if (action === "rotate-invite") {
      return NextResponse.json(
        await rotateWorkspaceInvite(userId, body.workspaceId)
      );
    }
    if (action === "transfer-owner") {
      await transferWorkspaceOwnership(userId, body.workspaceId, body.nextOwnerId);
      return NextResponse.json({ success: true });
    }

    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const workspace = await createWorkspace(userId, name);
    return NextResponse.json({ workspace }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (!Object.values(WorkspaceRole).includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const member = await updateWorkspaceMember(
      userId,
      body.workspaceId,
      body.memberId,
      body.role
    );
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 403 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const params = new URL(request.url).searchParams;
    const workspaceId = params.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (params.get("targetType") && params.get("targetId")) {
      await unshareFromWorkspace(
        userId,
        workspaceId,
        String(params.get("targetType")),
        String(params.get("targetId"))
      );
    } else {
      await removeWorkspaceMember(
        userId,
        workspaceId,
        params.get("userId") || userId
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 403 }
    );
  }
}
