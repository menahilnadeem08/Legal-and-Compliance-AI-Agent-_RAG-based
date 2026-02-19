import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Single unified token cookie. NextAuth session cookies kept as fallback
  // for the first request after Google OAuth (before AuthSync sets auth-token).
  const authToken =
    req.cookies.get("auth-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value;

  const forcePasswordChange =
    req.cookies.get("force-password-change")?.value === "true";

  // All /auth/* routes are public
  if (pathname.startsWith("/auth")) {
    if (authToken && forcePasswordChange) {
      if (!pathname.startsWith("/auth/change-password")) {
        return NextResponse.redirect(
          new URL("/auth/change-password", req.url)
        );
      }
    } else if (authToken && pathname.startsWith("/auth/change-password")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Authenticated user
  if (authToken) {
    if (forcePasswordChange) {
      return NextResponse.redirect(new URL("/auth/change-password", req.url));
    }
    return NextResponse.next();
  }

  // No authentication — redirect to login
  return NextResponse.redirect(new URL("/auth/login", req.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
