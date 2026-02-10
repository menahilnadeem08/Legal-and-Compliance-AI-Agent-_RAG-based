'use client';

/**
 * AppLayout - Global layout wrapper for viewport-constrained layout
 * 
 * This component ensures:
 * 1. Navbar takes fixed height at the top
 * 2. Main content fills remaining viewport height
 * 3. Content scrolls internally when it overflows
 * 4. No page-level scrolling unless content is minimal
 */

import React, { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
