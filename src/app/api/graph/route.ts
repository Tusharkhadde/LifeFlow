import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { getGraphVisualizationData } from "@/lib/graph-data";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const data = await getGraphVisualizationData(userId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch graph" }, { status: 500 });
  }
}
