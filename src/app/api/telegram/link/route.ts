import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Generate a short link code for Telegram linking
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Ensure user exists in DB
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: session.user.email || `${userId}@user.local`,
        name: session.user.name || "User",
      },
    });

    // Delete any existing link codes for this user
    await prisma.linkCode.deleteMany({ where: { userId } });

    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store the code with 5-minute expiry
    await prisma.linkCode.create({
      data: {
        userId,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return NextResponse.json({
      code,
      instructions: `Send this to your Telegram bot: /link ${code}`,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Link code generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate link code" },
      { status: 500 }
    );
  }
}

// Check if user has a linked Telegram account
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const links = await prisma.telegramLink.findMany({
      where: { userId },
    });

    return NextResponse.json({
      linked: links.length > 0,
      accounts: links.map((l) => ({
        telegramId: l.telegramUserId,
        name: l.telegramName,
        linkedAt: l.linkedAt,
      })),
    });
  } catch (error) {
    console.error("Check link error:", error);
    return NextResponse.json(
      { error: "Failed to check link status" },
      { status: 500 }
    );
  }
}

// Unlink Telegram account
export async function DELETE(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await prisma.telegramLink.deleteMany({ where: { userId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unlink error:", error);
    return NextResponse.json(
      { error: "Failed to unlink" },
      { status: 500 }
    );
  }
}
