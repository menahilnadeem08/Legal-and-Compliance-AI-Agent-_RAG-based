'use client';

import React, { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageContainer - Global content wrapper with proper padding, centering, and max-width
 * 
 * Uses flexbox centering:
 * - Outer flex container centers content horizontally
 * - Inner max-w-7xl wrapper constraints width
 * - Padding provides left/right spacing
 */
export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-br from-background to-background-alt px-6 sm:px-8 lg:px-12 py-6 sm:py-8 flex justify-center w-full">
      <div className={`w-full max-w-7xl ${className}`}>
        {children}
      </div>
    </div>
  );
}
