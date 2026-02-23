'use client';

import { useEffect } from 'react';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { setAuth, clearAllAuth } from './utils/auth';

function AuthSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    if (typeof window === 'undefined') return;

    // If the backend refresh token expired, force a full logout
    if ((session.user as any).error === 'RefreshTokenExpired') {
      clearAllAuth();
      signOut({ redirect: true, callbackUrl: '/auth/login' });
      return;
    }

    const accessToken = (session.user as any)?.accessToken;
    const refreshToken = (session.user as any)?.refreshToken;
    if (!accessToken) return;

    // Always sync the latest tokens from the NextAuth session to localStorage/cookie.
    // This keeps the frontend in sync after NextAuth auto-refreshes the backend tokens.
    const storedToken = localStorage.getItem('authToken');
    if (storedToken !== accessToken) {
      setAuth(accessToken, { ...session.user, role: 'admin' }, refreshToken);
    }
  }, [session]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={13 * 60}>
      <AuthSync />
      {children}
    </SessionProvider>
  );
}
