import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const nextAuthToken =
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value;

  const employeeToken = req.cookies.get("employee-token")?.value;
  const forcePasswordChange =
    req.cookies.get("force-password-change")?.value === "true";

  // All /auth/* routes are public (login, signup, activation, change-password)
  if (pathname.startsWith("/auth")) {
    if (employeeToken) {
      if (forcePasswordChange) {
        // Must change password — only allow change-password page
        if (!pathname.startsWith("/auth/change-password")) {
          return NextResponse.redirect(
            new URL("/auth/change-password", req.url)
          );
        }
      } else if (pathname.startsWith("/auth/change-password")) {
        // Already changed password — block access to change-password
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    return NextResponse.next();
  }

  // Admin authenticated via NextAuth — allow everything
  if (nextAuthToken) {
    return NextResponse.next();
  }

  // Employee authenticated via JWT cookie
  if (employeeToken) {
    if (forcePasswordChange) {
      return NextResponse.redirect(new URL("/auth/change-password", req.url));
    }

    // Admin-only routes — block employees
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

  // No authentication at all — redirect to login
  return NextResponse.redirect(new URL("/auth/login", req.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
