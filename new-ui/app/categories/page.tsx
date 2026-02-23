"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import {
  FolderTree,
  Plus,
  Loader2,
  EyeOff,
  Eye,
  Trash2,
  Tag,
} from "lucide-react";
import { getAuthToken, getAuthTokenForApi, getApiBase, clearAuth, isAdminUser } from "@/app/utils/auth";
import { toast } from "sonner";

type CategoryItem = { id: number | string; name: string; type: "default" | "custom" };
type HiddenDefault = { id: number; name: string };

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [hiddenDefaults, setHiddenDefaults] = useState<HiddenDefault[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth/login");
      return;
    }
    if (!isAdminUser()) {
      router.replace("/");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const fetchCategories = async () => {
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }
    setLoading(true);
    try {
      const [catRes, hiddenRes] = await Promise.all([
        fetch(`${getApiBase()}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${getApiBase()}/categories/hidden-defaults`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (catRes.status === 401 || hiddenRes.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (catRes.ok) {
        const data = await catRes.json();
        setCategories(Array.isArray(data) ? data : []);
      } else {
        setCategories([]);
      }
      if (hiddenRes.ok) {
        const data = await hiddenRes.json();
        setHiddenDefaults(Array.isArray(data) ? data : []);
      } else {
        setHiddenDefaults([]);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load categories.");
      setCategories([]);
      setHiddenDefaults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchCategories();
  }, [authChecked]);

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a category name.");
      return;
    }
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }
    setSubmitLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/custom-categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add category.");
        return;
      }
      toast.success("Category added.");
      setNewName("");
      await fetchCategories();
    } catch (err) {
      toast.error("Failed to add category.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const hideDefault = async (defaultCategoryId: number) => {
    const token = getAuthTokenForApi();
    if (!token) return;
    setActionLoading(`hide-${defaultCategoryId}`);
    try {
      const res = await fetch(`${getApiBase()}/categories/hide-default/${defaultCategoryId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (res.ok) {
        toast.success("Category hidden from list.");
        await fetchCategories();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to hide category.");
      }
    } catch {
      toast.error("Failed to hide category.");
    } finally {
      setActionLoading(null);
    }
  };

  const unhideDefault = async (defaultCategoryId: number) => {
    const token = getAuthTokenForApi();
    if (!token) return;
    setActionLoading(`unhide-${defaultCategoryId}`);
    try {
      const res = await fetch(`${getApiBase()}/categories/hide-default/${defaultCategoryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (res.ok) {
        toast.success("Category restored to list.");
        await fetchCategories();
      } else {
        toast.error("Failed to restore category.");
      }
    } catch {
      toast.error("Failed to restore category.");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCustom = async (id: number) => {
    const token = getAuthTokenForApi();
    if (!token) return;
    setActionLoading(`del-${id}`);
    try {
      const res = await fetch(`${getApiBase()}/custom-categories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (res.ok) {
        toast.success("Category removed.");
        await fetchCategories();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to remove category.");
      }
    } catch {
      toast.error("Failed to remove category.");
    } finally {
      setActionLoading(null);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const visibleDefaults = categories.filter((c) => c.type === "default");
  const customCats = categories.filter((c) => c.type === "custom");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <AppNav />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Categories</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Add custom categories or show/hide default ones. These options appear when uploading documents.
          </p>
        </div>

        {/* Add custom category */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add custom category
          </h2>
          <form onSubmit={handleAddCustom} className="flex flex-wrap gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Internal Policy"
              className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitLoading}
            />
            <button
              type="submit"
              disabled={submitLoading || !newName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
            >
              {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
              Add
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        ) : (
          <>
            {/* Visible categories (default + custom) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-8">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FolderTree className="w-5 h-5" />
                  Visible categories ({categories.length})
                </h2>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {categories.length === 0 ? (
                  <li className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                    No categories yet. Add a custom one or unhide defaults below.
                  </li>
                ) : (
                  categories.map((c) => (
                    <li
                      key={`${c.type}-${c.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <span className="font-medium text-slate-900 dark:text-white truncate">{c.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {c.type === "default" && (
                          <button
                            type="button"
                            onClick={() => hideDefault(Number(c.id))}
                            disabled={!!actionLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          >
                            {actionLoading === `hide-${c.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                            Hide
                          </button>
                        )}
                        {c.type === "custom" && (
                          <button
                            type="button"
                            onClick={() => deleteCustom(Number(c.id))}
                            disabled={!!actionLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            {actionLoading === `del-${c.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Hidden default categories */}
            {hiddenDefaults.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <EyeOff className="w-5 h-5" />
                    Hidden default categories
                  </h2>
                </div>
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {hiddenDefaults.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <span className="text-slate-700 dark:text-slate-300 truncate">{h.name}</span>
                      <button
                        type="button"
                        onClick={() => unhideDefault(h.id)}
                        disabled={!!actionLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                      >
                        {actionLoading === `unhide-${h.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                        Unhide
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}