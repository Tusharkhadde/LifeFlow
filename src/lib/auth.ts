import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/db";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const authSecret = process.env.BETTER_AUTH_SECRET;

if (!authSecret || authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters");
}

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (googleClientId && googleClientSecret) {
  socialProviders.google = {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
  };
}

if (
  githubClientId &&
  githubClientSecret &&
  githubClientId !== "your_github_client_id" &&
  githubClientSecret !== "your_github_client_secret"
) {
  socialProviders.github = {
    clientId: githubClientId,
    clientSecret: githubClientSecret,
  };
}

const getBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
};

const trustedOrigins = [
  "https://lifeflow-navy.vercel.app",
  ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.NEXT_PUBLIC_VERCEL_URL ? [`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`] : []),
];

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: getBaseURL(),
  secret: authSecret,
  trustedOrigins: Array.from(new Set(trustedOrigins)),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  plugins: [username()],
});

export type Session = typeof auth.$Infer.Session;
