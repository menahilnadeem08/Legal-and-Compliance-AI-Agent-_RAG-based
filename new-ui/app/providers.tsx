"use client";

import { useEffect } from "react";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { setAuth, clearAuth, AUTH_LOGIN_REDIRECT } from "@/app/utils/auth";

function AuthSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    if (typeof window === "undefined") return;
    if ((session.user as any).error === "RefreshTokenExpired") {
      clearAuth();
      signOut({ redirect: true, callbackUrl: AUTH_LOGIN_REDIRECT });
      return;
    }
    const accessToken = (session.user as any)?.accessToken;
    const refreshToken = (session.user as any)?.refreshToken;
    if (!accessToken) return;
    const stored = localStorage.getItem("accessToken");
    if (stored !== accessToken) {
      setAuth(accessToken, { ...session.user, role: "admin" }, refreshToken, "google");
    }
  }, [session]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={14 * 60}>
      <AuthSync />
      {children}
    </SessionProvider>
  );
}
