'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Navigation from '../../components/Navigation';
import PageContainer from '../../components/PageContainer';
import { getAuthToken } from '../../utils/auth';

interface CategoryItem {
  id: number;
  name: string;
  type: 'default' | 'custom';
}

interface HiddenDefault {
  id: number;
  name: string;
}

export default function AdminCategoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [hiddenDefaults, setHiddenDefaults] = useState<HiddenDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const token = getAuthToken(session);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [visRes, hidRes] = await Promise.all([
        axios.get<CategoryItem[]>(`${process.env.NEXT_PUBLIC_API_URL}/api/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get<HiddenDefault[]>(`${process.env.NEXT_PUBLIC_API_URL}/api/categories/hidden-defaults`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] })),
      ]);
      setCategories(visRes.data || []);
      setHiddenDefaults(Array.isArray(hidRes.data) ? hidRes.data : []);
    } catch (e: any) {
      if (e.response?.status === 403) {
        setError('Only admins can manage categories.');
        router.push('/admin');
      } else {
        setError('Failed to load categories.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'loading') return;
    if (!token && status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }
    if (token) load();
  }, [status, session, token]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !token) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/custom-categories`,
        { name },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      setNewName('');
      setSuccess('Category added.');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to add category.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRename = async (id: number) => {
    const name = editName.trim();
    if (!name || !token) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/custom-categories/${id}`,
        { name },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      setEditingId(null);
      setEditName('');
      setSuccess('Category renamed.');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to rename.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete custom category "${name}"? This will fail if any documents use it.`)) return;
    if (!token) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-categories/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess('Category deleted.');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to delete.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHideDefault = async (defaultCategoryId: number) => {
    if (!token) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/categories/hide-default/${defaultCategoryId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Default category hidden.');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to hide.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnhideDefault = async (defaultCategoryId: number) => {
    if (!token) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/categories/hide-default/${defaultCategoryId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Default category restored.');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to unhide.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <Navigation />
        <PageContainer>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Loading categories...</p>
            </div>
          </div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <PageContainer>
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Document categories</h1>
            <p className="text-gray-400 mt-1">
              Manage which categories appear in the upload dropdown. Add custom categories, hide default ones, or unhide them.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              {error}
            </div>
          )}
          {success && (
            <div className="p-4 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
              {success}
            </div>
          )}

          {/* Add custom category */}
          <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Add category</h2>
            <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. NDA, Franchise Agreement"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={submitting}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !newName.trim()}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Adding…' : 'Add category'}
              </button>
            </form>
          </section>

          {/* Visible categories */}
          <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Visible in upload dropdown</h2>
            {categories.length === 0 ? (
              <p className="text-gray-500">No categories yet. Add a custom one or unhide defaults below.</p>
            ) : (
              <ul className="space-y-2">
                {categories.map((cat) => (
                  <li
                    key={cat.type === 'custom' ? `custom-${cat.id}` : cat.id}
                    className="flex items-center justify-between gap-4 py-2 border-b border-slate-700/50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      {editingId === cat.id && cat.type === 'custom' ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(cat.id)}
                          className="w-full max-w-xs px-3 py-1.5 rounded bg-slate-700 border border-slate-600 text-white"
                          autoFocus
                        />
                      ) : (
                        <span className="text-white">
                          {cat.name}
                          {cat.type === 'custom' && (
                            <span className="ml-2 text-xs text-gray-500">(custom)</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {cat.type === 'default' && (
                        <button
                          type="button"
                          onClick={() => handleHideDefault(cat.id)}
                          disabled={submitting}
                          className="px-3 py-1 text-sm rounded bg-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-600/30 disabled:opacity-50"
                        >
                          Hide
                        </button>
                      )}
                      {cat.type === 'custom' && (
                        <>
                          {editingId === cat.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRename(cat.id)}
                                disabled={submitting || !editName.trim()}
                                className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingId(null); setEditName(''); }}
                                className="px-3 py-1 text-sm rounded bg-slate-600 text-gray-300 hover:bg-slate-500"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                                disabled={submitting}
                                className="px-3 py-1 text-sm rounded bg-slate-600 text-gray-300 hover:bg-slate-500 disabled:opacity-50"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(cat.id, cat.name)}
                                disabled={submitting}
                                className="px-3 py-1 text-sm rounded bg-red-600/20 text-red-300 border border-red-500/40 hover:bg-red-600/30 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Hidden default categories */}
          {hiddenDefaults.length > 0 && (
            <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-4">Hidden default categories</h2>
              <p className="text-gray-400 text-sm mb-4">These won’t appear in the upload dropdown. Unhide to show them again.</p>
              <ul className="space-y-2">
                {hiddenDefaults.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-4 py-2 border-b border-slate-700/50 last:border-0"
                  >
                    <span className="text-gray-400">{d.name}</span>
                    <button
                      type="button"
                      onClick={() => handleUnhideDefault(d.id)}
                      disabled={submitting}
                      className="px-3 py-1 text-sm rounded bg-green-600/20 text-green-300 border border-green-500/40 hover:bg-green-600/30 disabled:opacity-50"
                    >
                      Unhide
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </PageContainer>
    </>
  );
}
