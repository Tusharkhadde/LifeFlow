import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import {
  ensureProject,
  getProjectHub,
  linkToProject,
  listProjects,
  promoteCollectionToProject,
  unlinkFromProject,
  updateProject,
} from "@/lib/projects";
import { publishAppEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const hub = await getProjectHub(userId, id);
      if (!hub) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(hub);
    }
    return NextResponse.json({ projects: await listProjects(userId) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json();
    if (body.action === "link") {
      const link = await linkToProject(
        userId,
        body.projectId,
        body.targetType,
        body.targetId,
        body.relation
      );
      await publishAppEvent(userId, "project_updated", {
        id: body.projectId,
        targetType: body.targetType,
        targetId: body.targetId,
      });
      return NextResponse.json({ link }, { status: 201 });
    }
    if (body.action === "promote-collection") {
      const project = await promoteCollectionToProject(userId, body.collectionId);
      return NextResponse.json({ project }, { status: 201 });
    }
    const project = await ensureProject(userId, body.name, {
      description: body.description,
      color: body.color,
    });
    await publishAppEvent(userId, "project_updated", { id: project.id, name: project.name });
    return NextResponse.json({ project }, { status: 201 });
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
    const project = await updateProject(userId, body.id, body);
    await publishAppEvent(userId, "project_updated", { id: project.id, status: project.status });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (params.get("targetType") && params.get("targetId")) {
      await unlinkFromProject(
        userId,
        id,
        String(params.get("targetType")),
        String(params.get("targetId"))
      );
    } else {
      await updateProject(userId, id, { status: "archived" });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
