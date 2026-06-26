import { NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/", "/login", "/signup", "/api/auth", "/api/telegram"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    return NextResponse.next();
  }

  // Lightweight cookie check — full session validation happens in API routes/pages
  // Better Auth prefixes cookies with __Secure- on HTTPS sites
  const sessionToken = request.cookies.get("__Secure-better-auth.session_token") || request.cookies.get("better-auth.session_token");

  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }
    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
