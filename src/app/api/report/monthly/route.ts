import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { generateMonthlyReport } from "@/lib/monthly-report";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const report = await generateMonthlyReport(userId);
    const format = new URL(request.url).searchParams.get("format");

    if (format === "markdown" || format === "md") {
      return new NextResponse(report, {
        headers: { "Content-Type": "text/markdown", "Content-Disposition": "attachment; filename=lifeflow-monthly-report.md" },
      });
    }
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
