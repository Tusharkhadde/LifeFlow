import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  return NextResponse.json({ ok: true, message: "Telegram notification service active." });
}

export async function POST(_request: NextRequest) {
  return NextResponse.json({ ok: true, message: "Telegram notification service active." });
}
