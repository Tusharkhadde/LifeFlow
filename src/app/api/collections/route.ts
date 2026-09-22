import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import {
  addItemToCollection,
  autoOrganizeCollections,
  createCollection,
  deleteCollection,
  getCollectionItems,
  listCollections,
} from "@/lib/collections";
import { publishAppEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const detail = await getCollectionItems(userId, id);
      return NextResponse.json(detail);
    }
    const collections = await listCollections(userId);
    return NextResponse.json({ collections });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const body = await request.json().catch(() => ({}));

    if (body.action === "add-item") {
      const collection = await addItemToCollection(userId, body.collectionId, body.itemId);
      await publishAppEvent(userId, "collection_updated", { id: collection.id });
      return NextResponse.json({ collection });
    }

    if (body.name) {
      const collection = await createCollection(userId, body.name, body.color);
      await publishAppEvent(userId, "collection_updated", { id: collection.id, name: collection.name });
      return NextResponse.json({ collection }, { status: 201 });
    }

    const count = await autoOrganizeCollections(userId);
    const collections = await listCollections(userId);
    return NextResponse.json({ organized: count, collections });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });
    await deleteCollection(userId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
