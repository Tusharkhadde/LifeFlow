import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET is required" }, { status: 500 });
    }
    const body = await request.json();
    const { webhookUrl } = body;

    let parsedWebhookUrl: URL;
    try {
      parsedWebhookUrl = new URL(webhookUrl);
    } catch {
      return NextResponse.json({ error: "webhookUrl must be a valid HTTPS URL" }, { status: 400 });
    }
    if (parsedWebhookUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "webhookUrl must be a valid HTTPS URL" },
        { status: 400 }
      );
    }

    // Set the webhook on Telegram
    const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${webhookUrl}/api/telegram`,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message"],
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json(
        { error: "Failed to set webhook", details: data },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Webhook set to ${webhookUrl}/api/telegram`,
    });
  } catch (error) {
    console.error("Webhook setup error:", error);
    return NextResponse.json(
      { error: "Failed to set webhook" },
      { status: 500 }
    );
  }
}

// Check current webhook status
export async function GET() {
  try {
    const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Webhook status error:", error);
    return NextResponse.json(
      { error: "Failed to get webhook info" },
      { status: 500 }
    );
  }
}
