'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import FileUpload from '../components/FileUpload';
import Navigation from '../components/Navigation';

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
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
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
      <div className="w-screen h-screen flex flex-col bg-gradient-to-br from-background to-background-alt overflow-hidden pt-6">
        {/* Content */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-6">
          <div className="w-full">
            <FileUpload />
          </div>
        </div>

        {/* Footer */}
        <div className="glass-border m-6 mt-0">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <p>Upload documents in PDF or DOCX format</p>
            <Link href="/document" className="text-gray-400 hover:text-gray-300">
              View documents →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
