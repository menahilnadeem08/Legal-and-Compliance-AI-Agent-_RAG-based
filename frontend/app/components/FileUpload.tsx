'use client';

import { useState, useRef } from 'react';
import axios from 'axios';

export default function FileUpload({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('1.0');
  const [type, setType] = useState('policy');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFile(null);
    setVersion('1.0');
    setType('policy');
    setMessage('');
    setMessageType('');
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', version);
    formData.append('type', type);

    setUploading(true);
    setMessage('');

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMessage('✅ Document uploaded and processed successfully!');
      setMessageType('success');
      resetForm();

      if (onUploadSuccess) {
        onUploadSuccess();
      }

      setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 4000);
    } catch (error) {
      setMessage('❌ Upload failed. Please try again.');
      setMessageType('error');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'contract':
        return '📜';
      case 'regulation':
        return '⚖️';
      case 'case_law':
        return '📚';
      default:
        return '📋';
    }
  };

  return (
    <div className="glass-border h-full flex flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-500/20 to-gray-600/20 flex items-center justify-center text-lg border border-gray-500/40">
            📤
          </div>
          <h2 className="text-lg font-bold text-gray-300">Upload Document</h2>
        </div>
        <p className="text-xs text-gray-400">Add legal documents to your knowledge base</p>
      </div>

      <form onSubmit={handleUpload} className="space-y-4 flex flex-col flex-1">
        {/* File Upload Area */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            id="file-upload"
            accept=".pdf,.docx,.doc"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className="flex items-center justify-center w-full p-6 border-2 border-dashed border-gray-500/30 rounded-lg hover:border-gray-400/60 hover:bg-gray-500/5 transition-all cursor-pointer group"
          >
            <div className="text-center">
              <div className="text-4xl mb-2 group-hover:animate-float">📁</div>
              <p className="text-sm font-semibold text-foreground">Drop file or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">PDF, DOCX up to 50MB</p>
            </div>
          </label>

          {file && (
            <div className="mt-3 p-3 rounded-lg bg-gray-600/20 border border-gray-500/40 flex items-center gap-3 animate-fade-in">
              <span className="text-xl">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-xs px-4 py-2 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Document Type */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Document Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'policy', label: 'Policy', icon: '📋' },
              { value: 'contract', label: 'Contract', icon: '📜' },
              { value: 'regulation', label: 'Regulation', icon: '⚖️' },
              { value: 'case_law', label: 'Case Law', icon: '📚' },
            ].map((opt) => (
              <div
                key={opt.value}
                onClick={() => setType(opt.value)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setType(opt.value);
                  }
                }}
                className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                  type === opt.value
                    ? 'border-gray-400 bg-gray-500/20 text-gray-200 font-semibold'
                    : 'border-gray-600/40 text-gray-500 hover:border-gray-500/60 hover:bg-gray-600/10'
                }`}
              >
                <span className="text-lg block">{opt.icon}</span>
                <p className="text-xs mt-1 text-center">{opt.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Version */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Version
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g., 1.0"
            className="w-full"
          />
          <p className="text-xs text-gray-400 mt-1">Track document versions</p>
        </div>

        {/* Upload Button */}
        <div className="mt-auto space-y-3 pt-4 border-t border-foreground-dim/10">
          <button
            type="submit"
            disabled={!file || uploading}
            className="w-full py-4 px-4 flex items-center justify-center gap-2 font-semibold text-base rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 text-gray-100 hover:from-gray-500 hover:to-gray-600 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed shadow-lg"
          >
            {uploading ? (
              <>
                <span className="animate-pulse-glow">⟳</span> Processing...
              </>
            ) : (
              <>
                <span>📤</span> Upload Document
              </>
            )}
          </button>

          {/* Status Message */}
          {message && (
            <div
              className={`p-3 rounded-lg text-sm font-medium animate-fade-in ${
                messageType === 'success'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}
            >
              {message}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}