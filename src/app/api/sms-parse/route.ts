import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { parseBankSms } from "@/lib/sms-parser";
import { createExpenseFromParsed } from "@/lib/expense-actions";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const { text, save } = await request.json();
    if (!text) return NextResponse.json({ error: "SMS text required" }, { status: 400 });

    const parsed = parseBankSms(text);
    if (!parsed) return NextResponse.json({ error: "Could not parse SMS" }, { status: 400 });

    if (save) {
      const expense = await createExpenseFromParsed(userId, parsed, "sms");
      return NextResponse.json({ parsed, expense });
    }
    return NextResponse.json({ parsed });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
