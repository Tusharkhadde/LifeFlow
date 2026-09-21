import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const [events, jobs, audit] = await Promise.all([
      prisma.appEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      prisma.job.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          name: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    return NextResponse.json({ events, jobs, audit });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
