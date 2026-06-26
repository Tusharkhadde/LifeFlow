import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DEMO_USER_ID = "demo-user";

export async function getAuthenticatedUserId(headers?: Headers): Promise<string> {
  try {
    if (headers) {
      const session = await auth.api.getSession({ headers });
      if (session?.user?.id) {
        await ensureUserExists(session.user.id, session.user.email, session.user.name);
        return session.user.id;
      }
    }
  } catch {
    // Auth not configured or not available
  }
  // Fall back to demo user
  await ensureDemoUser();
  return DEMO_USER_ID;
}

async function ensureUserExists(userId: string, email?: string, name?: string) {
  return prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: email || `${userId}@user.local`,
      name: name || "User",
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
