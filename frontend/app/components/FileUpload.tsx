import { useState } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import Navigation from './Navigation';

export default function FileUpload() {
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('1.0');
  const [type, setType] = useState('policy');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile.type === 'application/pdf' ||
        droppedFile.type ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        setFile(droppedFile);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    // Get token from localStorage (employee) or session (admin Google OAuth)
    let token = localStorage.getItem('token');
    if (!token && session && (session.user as any)?.token) {
      token = (session.user as any).token;
    }

    if (!token) {
      setMessage('✗ Authentication token not found. Please refresh and try again.');
      console.log('DEBUG: No token found in localStorage or session');
      return;
    }

    console.log('DEBUG: Token found:', token.substring(0, 20) + '...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', version);
    formData.append('type', type);

    setUploading(true);
    setMessage('');

    try {
      console.log('DEBUG: Sending upload request with token');
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });
      setMessage('✓ Document uploaded successfully!');
      setFile(null);
      setVersion('1.0');
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Upload error:', error);
      console.log(
        'DEBUG: Error response:',
        error.response?.status,
        error.response?.data
      );
      if (error.response?.status === 401) {
        setMessage(
          '✗ Unauthorized. Your session may have expired. Please refresh and try again.'
        );
      } else if (error.response?.status === 403) {
        setMessage(
          '✗ You do not have permission to upload documents. Only admins can upload.'
        );
      } else {
        setMessage('✗ Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full bg-gradient-to-b from-slate-950 to-slate-900">
      <div className="max-w-full mx-auto px-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">Upload Document</h2>
            <p className="text-sm text-gray-400 mt-1">
              Add legal documents to your knowledge base
            </p>
          </div>
        </div>

        <div
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl border border-slate-700/50 p-8 mx-auto"
          style={{ maxWidth: '1400px' }}
        >
          <form onSubmit={handleUpload} className="space-y-6">
            {/* Horizontal Stepper Progress */}
            <div className="flex items-center justify-between mb-6">
              {[
                { step: 1, label: 'Document', icon: '📄', active: true },
                { step: 2, label: 'Type', icon: '📋', active: !!file },
                {
                  step: 3,
                  label: 'Version',
                  icon: '📌',
                  active: !!file && !!type,
                },
                {
                  step: 4,
                  label: 'Upload',
                  icon: '✓',
                  active: !!file && !!type && !!version,
                },
              ].map((item, idx) => (
                <div key={item.step} className="flex items-center flex-1">
                  <div
                    className={`flex flex-col items-center ${
                      idx < 3 ? 'flex-1' : ''
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold transition-all ${
                        item.active
                          ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                          : 'bg-slate-700/50 border-2 border-slate-600 text-gray-400'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <p
                      className={`text-sm font-medium mt-3 transition-all ${
                        item.active ? 'text-blue-300' : 'text-gray-500'
                      }`}
                    >
                      {item.label}
                    </p>
                  </div>

                  {idx < 3 && (
                    <div
                      className={`h-1 flex-1 mx-4 rounded transition-all ${
                        item.active && idx < 3 ? 'bg-blue-500' : 'bg-slate-700'
                      }`}
                    ></div>
                  )}
                </div>
              ))}
            </div>

            {/* Horizontal Form Layout */}
            <div className="grid grid-cols-4 gap-6 items-start">
              {/* Step 1: File Upload */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Document
                </label>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-xl transition-all ${
                    dragActive
                      ? 'border-blue-400 bg-blue-500/5'
                      : file
                      ? 'border-green-500 bg-green-500/5'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <input
                    type="file"
                    id="file-upload"
                    accept=".pdf,.docx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />

                  <label
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center py-12 px-6 cursor-pointer"
                  >
                    {file ? (
                      <div className="text-center">
                        <div className="text-green-400 text-4xl mb-4">✓</div>
                        <p className="text-sm text-white font-medium truncate max-w-full">
                          {file.name}
                        </p>
                        <p className="text-sm text-gray-400 mt-2">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-slate-400 text-4xl mb-4">📎</div>
                        <p className="text-sm text-white font-medium">
                          Choose File
                        </p>
                        <p className="text-sm text-gray-500 mt-2">PDF or DOCX</p>
                      </div>
                    )}
                  </label>
                </div>
                {file && (
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="mt-6 text-sm text-blue-400 hover:text-blue-300 w-full text-center transition-colors"
                  >
                    Clear file
                  </button>
                )}
              </div>

              {/* Step 2: Document Type */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Type
                </label>
                <div className="space-y-4">
                  {[
                    { value: 'policy', label: 'Policy', icon: '📋' },
                    { value: 'contract', label: 'Contract', icon: '📄' },
                    { value: 'regulation', label: 'Regulation', icon: '⚖️' },
                    { value: 'case-law', label: 'Case Law', icon: '🏛️' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setType(option.value)}
                      disabled={!file}
                      className={`w-full p-4 rounded-lg border text-sm font-medium transition-all ${
                        type === option.value
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                          : file
                          ? 'bg-slate-800/50 border-slate-700 text-gray-400 hover:border-slate-600 hover:bg-slate-800'
                          : 'bg-slate-800/30 border-slate-700/50 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      <span className="mr-2">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Version */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Version
                </label>
                <select
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  disabled={!file || !type}
                  className={`w-full p-4 bg-slate-800/50 border rounded-lg text-white text-sm focus:outline-none transition-all appearance-none cursor-pointer ${
                    file && type
                      ? 'border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      : 'border-slate-700/50 bg-slate-800/30 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {['1.0', '2.0', '3.0', '4.0', '5.0'].map((v) => (
                    <option key={v} value={v} className="bg-slate-900">
                      v{v}
                    </option>
                  ))}
                </select>
                <p className="mt-5 text-sm text-gray-500">Select document version</p>
              </div>

              {/* Step 4: Upload Button */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Action
                </label>
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="w-full h-[120px] bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-medium disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed hover:from-blue-500 hover:to-blue-400 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 disabled:shadow-none flex flex-col items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-10 w-10" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span className="text-base">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-10 h-10"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <span className="text-base font-semibold">Upload Document</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Success/Error Message */}
          {message && (
            <div
              className={`mt-6 p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
                message.includes('✓')
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              <span className="text-lg">{message.includes('✓') ? '✓' : '✗'}</span>
              {message}
            </div>
          )}
        </div>

        {/* Helper Text */}
        <div className="mt-4 text-center text-xs text-gray-500">
          Upload documents in PDF or DOCX format
        </div>
      </div>
    </div>
  );
}
