'use client';

import { useState } from 'react';
import Link from 'next/link';
import FileUpload from '../components/FileUpload';

export default function UploadPage() {
  const [uploaded, setUploaded] = useState(false);

  return (
    <div className="w-screen h-screen flex flex-col bg-gradient-to-br from-background to-background-alt overflow-hidden">
      {/* Header */}
      <div className="glass-border m-6 mb-0 rounded-b-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-lg bg-gray-600/30 flex items-center justify-center text-gray-300 hover:bg-gray-600/50 transition-all"
            >
              ←
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-300">📤 Upload Document</h1>
              <p className="text-xs text-gray-400">Add legal documents to your knowledge base</p>
            </div>
          </div>
          <Link
            href="/"
            className="px-6 py-3 rounded-lg font-medium transition-all bg-gray-600/30 text-gray-300 border border-gray-500/50 hover:bg-gray-600/50"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <FileUpload onUploadSuccess={() => setUploaded(true)} />
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
  );
}
