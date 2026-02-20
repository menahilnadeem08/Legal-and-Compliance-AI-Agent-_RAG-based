'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navigation from '../components/Navigation';
import PageContainer from '../components/PageContainer';
import { getAuthToken, isEmployeeUser } from '../utils/auth';

interface Document {
  id: string;
  filename: string;
  category: string;
  version: number;
  is_active: boolean;
  upload_date: string;
}

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);

  useEffect(() => {
    if (isEmployeeUser()) {
      setIsEmployee(true);
      setIsAdmin(false);
    } else if (getAuthToken(session)) {
      setIsAdmin(true);
      setIsEmployee(false);
    } else if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, session, router]);

  const fetchDocuments = async () => {
    try {
      const token = getAuthToken(session);
      if (!token) {
        setError('Authentication required to view documents.');
        return;
      }

      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/documents`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setDocuments(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      if (err.response?.status === 401) {
        setError('Session expired or unauthorized. Please sign in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view documents.');
      } else {
        setError('Failed to load documents. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Only admins can delete documents
    if (!isAdmin) {
      alert('You do not have permission to delete documents.');
      return;
    }

    if (!confirm('Are you sure you want to delete this document?')) return;

    setDeleting(id);
    try {
      // Get token using the proper helper function
      const token = getAuthToken(session);

      if (!token) {
        alert('Authentication required to delete documents.');
        return;
      }

      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/documents/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (err: any) {
      console.error('Delete error:', err);
      if (err.response?.status === 403) {
        alert('You do not have permission to delete this document.');
      } else {
        alert('Failed to delete document');
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (id: string, shouldActivate: boolean) => {
    // Only admins can toggle document status
    if (!isAdmin) {
      alert('You do not have permission to change document status.');
      return;
    }

    setToggling(id);
    try {
      // Get token using the proper helper function
      const token = getAuthToken(session);

      if (!token) {
        alert('Authentication required to update document status.');
        return;
      }

      const action = shouldActivate ? 'activate' : 'deactivate';
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/documents/${id}/${action}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Refresh list to reflect updated active state
      await fetchDocuments();
    } catch (err: any) {
      console.error('Toggle active error:', err);
      if (err.response?.status === 403) {
        alert('You do not have permission to change document status.');
      } else {
        alert('Failed to update document status.');
      }
    } finally {
      setToggling(null);
    }
  };

  useEffect(() => {
    // Wait for NextAuth to finish loading before trying to fetch with session token
    if (status === 'loading') return;

    fetchDocuments();
  }, [status, session]);

  const getDocumentIcon = (category: string) => {
    if (category.includes('Constitution')) return '📜';
    if (category.includes('Legislation') || category.includes('Acts')) return '📋';
    if (category.includes('Ordinances')) return '🏛️';
    if (category.includes('Statutory') || category.includes('SROs')) return '⚙️';
    if (category.includes('Judgment')) return '⚖️';
    if (category.includes('Order')) return '📄';
    if (category.includes('AJK') || category.includes('GB')) return '🗺️';
    return '📋';
  };

  const getDocumentColor = (category: string) => {
    if (category.includes('Constitution')) return 'from-purple-500/20 to-indigo-500/20 border-purple-500/40';
    if (category.includes('Legislation') || category.includes('Acts')) return 'from-blue-500/20 to-cyan-500/20 border-blue-500/40';
    if (category.includes('Ordinances')) return 'from-amber-500/20 to-orange-500/20 border-amber-500/40';
    if (category.includes('Statutory') || category.includes('SROs')) return 'from-green-500/20 to-emerald-500/20 border-green-500/40';
    if (category.includes('Judgment')) return 'from-red-500/20 to-pink-500/20 border-red-500/40';
    if (category.includes('Order')) return 'from-yellow-500/20 to-orange-500/20 border-yellow-500/40';
    if (category.includes('AJK') || category.includes('GB')) return 'from-teal-500/20 to-cyan-500/20 border-teal-500/40';
    return 'from-cyan-500/20 to-teal-500/20 border-cyan-500/40';
  };

  return (
    <>
      <Navigation />
      <PageContainer>
        <div className="w-full h-full flex flex-col gap-3">
          {/* Documents Grid */}
          <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-400">Loading documents...</p>
              </div>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <div className="text-6xl mb-3">📭</div>
                <p className="text-sm font-semibold text-gray-300 mb-1">No documents found</p>
                <p className="text-xs text-gray-500">
                  Upload your first document from the chat
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`p-4 rounded-lg border-2 bg-gradient-to-br ${getDocumentColor(
                    doc.category
                  )} transition-all hover:shadow-lg animate-fade-in ${
                    doc.is_active
                      ? 'opacity-100'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-3xl flex-shrink-0">
                        {getDocumentIcon(doc.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-200 truncate">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {doc.category}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-700/60 text-gray-300 border border-gray-600">
                      v{doc.version}
                    </span>
                    {doc.is_active && (
                      <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-500/50">
                        ✓ Active
                      </span>
                    )}
                    {!doc.is_active && (
                      <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/50">
                        ⊘ Inactive
                      </span>
                    )}
                  </div>

                  {/* Date and Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      📅 {new Date(doc.upload_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button
                          onClick={() => handleToggleActive(doc.id, !doc.is_active)}
                          disabled={toggling === doc.id || deleting === doc.id}
                          className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                            doc.is_active
                              ? 'bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/40'
                              : 'bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/40'
                          } disabled:opacity-50`}
                          title={doc.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {toggling === doc.id ? '⟳' : doc.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="px-3 py-1 text-xs rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/40 transition-all disabled:opacity-50"
                          title="Delete document"
                        >
                          {deleting === doc.id ? '⟳' : '🗑'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 p-4 rounded-lg bg-gray-800/30 border border-gray-700/50 text-xs text-gray-400">
          Total: <span className="font-semibold text-gray-300">{documents.length}</span> document{documents.length !== 1 ? 's' : ''} 
          {documents.length > 0 && (
            <> • <span className="text-green-400">{documents.filter(d => d.is_active).length}</span> active</>
          )}
        </div>
      </div>
      </PageContainer>
    </>
  );
}
