import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("__Secure-next-auth.session-token")?.value ||
                req.cookies.get("next-auth.session-token")?.value;
  
  // If there's a NextAuth token (admin), allow access
  if (token) {
    return NextResponse.next();
  }

  // For public routes, allow access (auth routes)
  const pathname = req.nextUrl.pathname;
  const publicRoutes = ["/auth"];
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Only truly admin-only routes require NextAuth token
  // Home page (/) handles both admin and employee auth client-side
  // Employee routes (/profile, /documents, /chat) handle auth client-side
  const adminRoutes = ["/upload", "/admin"];
  if (adminRoutes.some(route => pathname === route || pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/upload",
    "/admin",
    "/",
    "/((?!auth|profile|document|chat|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
