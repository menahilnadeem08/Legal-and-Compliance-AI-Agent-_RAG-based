'use client';

import React, { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageContainer - Global content wrapper with horizontal padding and viewport constraining
 * 
 * Features:
 * - Horizontal padding: px-4 (mobile), px-6 (tablet), px-8 (desktop)
 * - Vertical padding: py-6 (mobile), py-8 (tablet)
 * - Flex-1 with min-h-0 to allow internal scrolling
 * - Gradient background applied consistently
 * 
 * Child Structure:
 * Content inside PageContainer should use max-w-7xl mx-auto wrapper
 * to center content with professional spacing on all screen sizes
 */
export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-br from-background to-background-alt">
      <div className={`w-full h-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 ${className}`}>
        {children}
      </div>
    </div>
  );
}
