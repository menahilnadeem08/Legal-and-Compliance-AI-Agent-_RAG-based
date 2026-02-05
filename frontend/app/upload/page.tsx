'use client';

import { useState } from 'react';
import Link from 'next/link';
import FileUpload from '../components/FileUpload';
import Navigation from '../components/Navigation';

export default function UploadPage() {
  const [uploaded, setUploaded] = useState(false);

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
            <Link href="/documents" className="text-gray-400 hover:text-gray-300">
              View documents →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
