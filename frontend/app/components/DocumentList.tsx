'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import Link from 'next/link';

interface Document {
  id: string;
  name: string;
  type: string;
  version: string;
  upload_date: string;
  is_latest: boolean;
}

export default function DocumentList() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    try {
      // Get token from localStorage (employee) or session (admin Google OAuth)
      let token = localStorage.getItem('token');
      if (!token && session && (session.user as any)?.token) {
        token = (session.user as any).token;
      }
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      setDocuments(response.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="glass-border h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center text-lg border border-cyan-500/40">
            📚
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">Documents</h2>
            <p className="text-sm text-gray-400 mt-1">{documents.length} document{documents.length !== 1 ? 's' : ''} in knowledge base</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-gray-500">Loading...</p>
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="text-3xl mb-2">📭</div>
            <p className="text-xs font-semibold text-gray-400 mb-1">No documents</p>
            <p className="text-xs text-gray-500">Upload documents to get started</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {documents.slice(0, 3).map((doc) => (
            <div
              key={doc.id}
              className={`p-2 rounded-lg border text-xs transition-all ${
                doc.is_latest
                  ? 'bg-gray-700/30 border-gray-600 text-gray-300'
                  : 'bg-gray-800/40 border-gray-700 text-gray-500 opacity-60'
              }`}
            >
              <p className="font-semibold truncate">{doc.name}</p>
              <p className="text-gray-500">v{doc.version}</p>
            </div>
          ))}
          {documents.length > 3 && (
            <p className="text-xs text-gray-500 text-center py-2">
              +{documents.length - 3} more...
            </p>
          )}
        </div>
      )}

      {/* View All Button */}
      <Link
        href="/document"
        className="mt-6 w-full px-6 py-4 text-sm rounded-lg bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-300 border border-cyan-500/50 hover:from-cyan-500/30 hover:to-teal-500/30 transition-all font-semibold text-center"
      >
        📄 View All Documents
      </Link>
    </div>
  );
}