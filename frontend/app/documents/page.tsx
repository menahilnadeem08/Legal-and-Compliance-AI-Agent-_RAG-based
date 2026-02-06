'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Navigation from '../components/Navigation';

interface Document {
  id: string;
  name: string;
  type: string;
  version: string;
  upload_date: string;
  is_latest: boolean;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'latest' | 'outdated'>('all');

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/documents`);
      setDocuments(response.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    setDeleting(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${id}`);
      await fetchDocuments();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (doc: Document) => {
    setToggling(doc.id);
    try {
      const endpoint = doc.is_latest ? 'deactivate' : 'activate';
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${doc.id}/${endpoint}`);
      await fetchDocuments();
    } catch (error: any) {
      console.error('Toggle error:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to update document status';
      alert(errorMsg);
    } finally {
      setToggling(null);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const getDocumentIcon = (type: string) => {
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

  const getDocumentColor = (type: string) => {
    switch (type) {
      case 'contract':
        return 'from-amber-500/20 to-orange-500/20 border-amber-500/40';
      case 'regulation':
        return 'from-purple-500/20 to-pink-500/20 border-purple-500/40';
      case 'case_law':
        return 'from-blue-500/20 to-cyan-500/20 border-blue-500/40';
      default:
        return 'from-cyan-500/20 to-teal-500/20 border-cyan-500/40';
    }
  };

  const filteredDocuments = documents.filter(doc => {
    if (filter === 'latest') return doc.is_latest;
    if (filter === 'outdated') return !doc.is_latest;
    return true;
  });

  return (
    <>
      <Navigation />
      <div className="w-screen h-screen flex flex-col bg-gradient-to-br from-background to-background-alt overflow-hidden pt-8">
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col p-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'all', label: 'All Documents', icon: '📋' },
            { id: 'latest', label: 'Active Versions', icon: '✓' },
            { id: 'outdated', label: 'Inactive', icon: '⏸️' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-6 py-3 rounded-lg transition-all font-medium ${
                filter === tab.id
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400'
                  : 'bg-gray-600/20 text-gray-400 border border-gray-500/30 hover:bg-gray-600/30'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Documents Grid */}
        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-400">Loading documents...</p>
              </div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <div className="text-6xl mb-3">📭</div>
                <p className="text-sm font-semibold text-gray-300 mb-1">No documents found</p>
                <p className="text-xs text-gray-500">
                  {filter !== 'all' 
                    ? `No ${filter === 'latest' ? 'active' : 'inactive'} documents available`
                    : 'Upload your first document from the chat'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`p-4 rounded-lg border-2 bg-gradient-to-br ${getDocumentColor(
                    doc.type
                  )} transition-all hover:shadow-lg animate-fade-in ${
                    doc.is_latest
                      ? 'opacity-100'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-3xl flex-shrink-0">
                        {getDocumentIcon(doc.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-200 truncate">
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          Type: {doc.type.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Version Badge */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-700/60 text-gray-300 border border-gray-600">
                      v{doc.version}
                    </span>
                  </div>

                  {/* Date */}
                  <p className="text-xs text-gray-500 mb-3">
                    📅 {new Date(doc.upload_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>

                  {/* Toggle Switch & Delete */}
                  <div className="flex items-center justify-between gap-3">
                    {/* Status Toggle */}
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-xs text-gray-400 font-medium">Status:</span>
                      <button
                        onClick={() => handleToggleActive(doc)}
                        disabled={toggling === doc.id}
                        className={`
                          relative inline-flex h-7 w-12 shrink-0 items-center rounded-full
                          transition-all duration-300 ease-in-out
                          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
                          ${toggling === doc.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
                          ${doc.is_latest 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 focus:ring-green-400 shadow-green-500/50 shadow-md' 
                            : 'bg-gray-700 focus:ring-gray-400'
                          }
                        `}
                      >
                        <span
                          className={`
                            inline-block h-5 w-5 transform rounded-full 
                            bg-white shadow-lg ring-1 ring-gray-900/10
                            transition-all duration-300 ease-in-out
                            ${doc.is_latest ? 'translate-x-6 scale-100' : 'translate-x-1 scale-95'}
                          `}
                        />
                      </button>
                      <span className={`text-xs font-semibold transition-colors duration-200 ${
                        doc.is_latest ? 'text-emerald-400' : 'text-gray-500'
                      }`}>
                        {toggling === doc.id ? '⟳ Updating...' : doc.is_latest ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting === doc.id}
                      className="px-3 py-2 text-xs rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 hover:border-red-400/50 transition-all disabled:opacity-50"
                    >
                      {deleting === doc.id ? '⟳' : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 p-4 rounded-lg bg-gray-800/30 border border-gray-700/50 text-xs text-gray-400">
          Total: <span className="font-semibold text-gray-300">{filteredDocuments.length}</span> document{filteredDocuments.length !== 1 ? 's' : ''} 
          {filter === 'all' && documents.length > 0 && (
            <> • <span className="text-green-400">{documents.filter(d => d.is_latest).length}</span> active</>
          )}
        </div>
      </div>
    </div>
    </>
  );
}