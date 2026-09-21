import { NextRequest, NextResponse } from "next/server";
import { getPublicShare } from "@/lib/share-links";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  const item = await getPublicShare(token);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}
