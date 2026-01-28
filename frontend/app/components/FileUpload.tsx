'use client';

import { useState } from 'react';
import axios from 'axios';

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('1.0');
  const [type, setType] = useState('policy');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

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
      const response = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage('Document uploaded successfully!');
      setFile(null);
    } catch (error) {
      setMessage('Upload failed. Check console for errors.');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 rounded shadow border border-gray-700">
      <h2 className="text-xl font-bold mb-4 text-white">Upload Document</h2>
      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <input
            type="file"
            id="file-upload"
            accept=".pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700 transition-colors font-medium"
          >
            Choose File
          </label>
          {file && (
            <span className="ml-3 text-sm text-gray-300">{file.name}</span>
          )}
        </div>
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="Version (e.g., 1.0)"
          className="block w-full p-2 border border-gray-600 rounded bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="block w-full p-2 border border-gray-600 rounded bg-gray-800 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="policy" className="bg-gray-800 text-white">Policy</option>
          <option value="contract" className="bg-gray-800 text-white">Contract</option>
          <option value="regulation" className="bg-gray-800 text-white">Regulation</option>
          <option value="case_law" className="bg-gray-800 text-white">Case Law</option>
        </select>
        <button
          type="submit"
          disabled={!file || uploading}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-600 hover:bg-green-700 transition-colors font-medium"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-gray-300">{message}</p>}
    </div>
  );
}