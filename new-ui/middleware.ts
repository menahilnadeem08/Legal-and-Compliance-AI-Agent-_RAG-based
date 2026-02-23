import { NextRequest, NextResponse } from "next/server";

const FORCE_PASSWORD_CHANGE_COOKIE = "force-password-change";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const forcePasswordChange = req.cookies.get(FORCE_PASSWORD_CHANGE_COOKIE)?.value === "true";

  // If user must change password, allow only the change-password page
  if (forcePasswordChange) {
    if (!pathname.startsWith("/auth/change-password")) {
      return NextResponse.redirect(new URL("/auth/change-password", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|assets).*)"],
};
