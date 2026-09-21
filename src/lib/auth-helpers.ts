import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveApiKeyAuth } from "@/lib/api-keys";

const DEMO_USER_ID = "demo-user";

function getBearerToken(headers: Headers) {
  const header = headers.get("authorization") || headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

export interface AuthenticationContext {
  userId: string;
  method: "session" | "api-key";
  apiKeyId?: string;
  scopes?: string[];
}

export async function getAuthentication(
  headers?: Headers,
  requiredScope?: string
): Promise<AuthenticationContext> {
  if (!headers) {
    throw new Error("Authentication required");
  }

  try {
    const session = await auth.api.getSession({ headers });
    if (session?.user?.id) {
      await ensureUserExists(session.user.id, session.user.email, session.user.name);
      return { userId: session.user.id, method: "session" };
    }
  } catch {
    // Fall through to API key auth
  }

  const bearer = getBearerToken(headers);
  if (bearer) {
    const key = await resolveApiKeyAuth(bearer, requiredScope);
    if (key) {
      return {
        userId: key.userId,
        method: "api-key",
        apiKeyId: key.keyId,
        scopes: key.scopes,
      };
    }
  }

  throw new Error("Authentication required");
}

export async function getAuthenticatedUserId(
  headers?: Headers,
  requiredScope?: string
): Promise<string> {
  return (await getAuthentication(headers, requiredScope)).userId;
}

export async function getAuthenticatedUserIdOrDemo(headers?: Headers): Promise<string> {
  try {
    return await getAuthenticatedUserId(headers);
  } catch {
    if (process.env.NODE_ENV === "development") {
      await ensureDemoUser();
      return DEMO_USER_ID;
    }
    throw new Error("Authentication required");
  }
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
