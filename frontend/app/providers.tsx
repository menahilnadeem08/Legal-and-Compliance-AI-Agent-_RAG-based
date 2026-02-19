'use client';

import { useEffect } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { setAuth } from './utils/auth';

function AuthSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    const token = (session.user as any)?.token;
    if (!token || typeof window === 'undefined') return;

    if (!localStorage.getItem('authToken')) {
      setAuth(token, { ...session.user, role: 'admin' });
    }
  }, [session]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthSync />
      {children}
    </SessionProvider>
  );
}
