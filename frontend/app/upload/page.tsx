'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import FileUpload from '../components/FileUpload';
import Navigation from '../components/Navigation';
import PageContainer from '../components/PageContainer';

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    // Block employee users (local JWT login) from accessing /upload
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

    // If employee is logged in via localStorage, redirect to home
    if (token && userStr) {
      router.replace('/');
      return;
    }

    // If not an employee and NextAuth is loaded but no admin session, send to admin login
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!session) {
    return null;
  }

  return (
    <>
      <Navigation />
      <PageContainer>
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
          {/* Content */}
          <div className="flex-1 overflow-hidden flex items-center justify-center py-8">
          <div className="w-full">
            <FileUpload />
          </div>
        </div>

          {/* Footer */}
          <div className="flex-shrink-0 glass-border my-6 sm:my-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs sm:text-sm text-gray-500">
              <p>Upload documents in PDF or DOCX format</p>
              <Link href="/document" className="text-gray-400 hover:text-gray-300 whitespace-nowrap">
                View documents →
              </Link>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
