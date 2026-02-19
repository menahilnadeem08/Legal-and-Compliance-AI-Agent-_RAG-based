import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Unified cookie checks — both Google OAuth and local admin use admin-token.
  // NextAuth session cookie kept as bridge for the first request after Google OAuth
  // (before AuthSync has a chance to set admin-token on the client).
  const adminToken =
    req.cookies.get("admin-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value;

  const employeeToken = req.cookies.get("employee-token")?.value;
  const forcePasswordChange =
    req.cookies.get("force-password-change")?.value === "true";

  // All /auth/* routes are public
  if (pathname.startsWith("/auth")) {
    if (employeeToken) {
      if (forcePasswordChange) {
        if (!pathname.startsWith("/auth/change-password")) {
          return NextResponse.redirect(
            new URL("/auth/change-password", req.url)
          );
        }
      } else if (pathname.startsWith("/auth/change-password")) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    return NextResponse.next();
  }

  // Admin authenticated (Google OAuth or local login)
  if (adminToken) {
    return NextResponse.next();
  }

  // Employee authenticated
  if (employeeToken) {
    if (forcePasswordChange) {
      return NextResponse.redirect(new URL("/auth/change-password", req.url));
    }

    const adminOnlyRoutes = ["/upload", "/admin"];
    if (
      adminOnlyRoutes.some(
        (route) => pathname === route || pathname.startsWith(route + "/")
      )
    ) {
      return NextResponse.redirect(new URL("/", req.url));
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
