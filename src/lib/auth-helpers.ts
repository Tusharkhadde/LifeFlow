import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

const DEMO_USER_ID = "demo-user";

export async function getAuthenticatedUserId(): Promise<string> {
  try {
    const { userId } = await auth();
    if (userId) {
      await ensureUserExists(userId);
      return userId;
    }
  } catch {
    // Clerk not configured or not available
  }
  // Fall back to demo user
  await ensureDemoUser();
  return DEMO_USER_ID;
}

async function ensureUserExists(clerkUserId: string) {
  return prisma.user.upsert({
    where: { id: clerkUserId },
    update: {},
    create: {
      id: clerkUserId,
      email: `${clerkUserId}@clerk.user`,
      name: "User",
    },
  });
}

async function ensureDemoUser() {
  return prisma.user.upsert({
    where: { email: "demo@lifeflow.ai" },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: "demo@lifeflow.ai",
      name: "Demo User",
    },
  });
}
