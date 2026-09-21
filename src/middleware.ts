import { NextRequest, NextResponse } from "next/server";

const publicExact = new Set(["/login", "/signup"]);

function isPublicPath(pathname: string) {
  if (publicExact.has(pathname)) return true;
  if (pathname.startsWith("/s/")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/telegram")) return true;
  if (pathname.startsWith("/api/health")) return true;
  if (pathname.startsWith("/api/v1")) return true;
  if (pathname.startsWith("/api/mcp")) return true;
  if (pathname.startsWith("/api/share/public")) return true;
  if (pathname.startsWith("/api/weekly-review")) return true;
  if (pathname.startsWith("/api/jobs/dispatch")) return true;
  if (pathname.startsWith("/api/automation/run")) return true;
  if (pathname.startsWith("/api/maintenance")) return true;
  if (pathname.endsWith("/callback") && pathname.startsWith("/api/integrations/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const next = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-request-id", requestId);
    return response;
  };

  const sessionToken =
    request.cookies.get("__Secure-better-auth.session_token") ||
    request.cookies.get("better-auth.session_token");

  if (pathname === "/") {
    if (sessionToken) {
      const response = NextResponse.redirect(new URL("/dashboard/today", request.url));
      response.headers.set("x-request-id", requestId);
      return response;
    }
    return next();
  }

  if (isPublicPath(pathname)) {
    return next();
  }

  if (pathname.startsWith("/api/")) {
    if (sessionToken) return next();
    return NextResponse.json(
      { error: "Unauthorized", requestId },
      { status: 401, headers: { "x-request-id": requestId } }
    );
  }

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
