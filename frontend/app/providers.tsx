'use client';

import { useEffect } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { setAdminAuth } from './utils/auth';

function AuthSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    const token = (session.user as any)?.token;
    if (!token || typeof window === 'undefined') return;

    if (!localStorage.getItem('adminToken')) {
      setAdminAuth(token, session.user);
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
