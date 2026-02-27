"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { PageTour } from "@/app/components/PageTour";
import {
  FolderTree,
  Plus,
  Loader2,
  EyeOff,
  Eye,
  Trash2,
  Tag,
} from "lucide-react";
import { getAuthToken, isAdminUser, AUTH_LOGIN_REDIRECT } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";
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

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace(AUTH_LOGIN_REDIRECT);
      return;
    }
    if (!isAdminUser()) {
      router.replace("/");
      return;
    }
  }, [router]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const [catRes, hiddenRes] = await Promise.all([
        api.get<{ categories?: CategoryItem[] }>("/categories"),
        api.get<{ categories?: HiddenDefault[] }>("/categories/hidden-defaults"),
      ]);
      if (catRes.success && catRes.data?.categories != null) {
        setCategories(catRes.data.categories);
      } else {
        setCategories([]);
      }
      if (hiddenRes.success && hiddenRes.data?.categories != null) {
        setHiddenDefaults(hiddenRes.data.categories);
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
    if (getAuthToken() && isAdminUser()) fetchCategories();
  }, []);

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a category name.");
      return;
    }
    setSubmitLoading(true);
    try {
      const response = await api.post("/custom-categories", { name });
      if (response.success) {
        toast.success("Category added.");
        setNewName("");
        await fetchCategories();
      } else {
        toast.error(response.message ?? "Failed to add category.");
      }
    } catch (err) {
      toast.error("Failed to add category.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const hideDefault = async (defaultCategoryId: number) => {
    setActionLoading(`hide-${defaultCategoryId}`);
    try {
      const response = await api.post(`/categories/hide-default/${defaultCategoryId}`);
      if (response.success) {
        toast.success("Category hidden from list.");
        await fetchCategories();
      } else {
        toast.error(response.message ?? "Failed to hide category.");
      }
    } catch {
      toast.error("Failed to hide category.");
    } finally {
      setActionLoading(null);
    }
  };

  const unhideDefault = async (defaultCategoryId: number) => {
    setActionLoading(`unhide-${defaultCategoryId}`);
    try {
      const response = await api.delete(`/categories/hide-default/${defaultCategoryId}`);
      if (response.success) {
        toast.success("Category restored to list.");
        await fetchCategories();
      } else {
        toast.error(response.message ?? "Failed to restore category.");
      }
    } catch {
      toast.error("Failed to restore category.");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCustom = async (id: number) => {
    setActionLoading(`del-${id}`);
    try {
      const response = await api.delete(`/custom-categories/${id}`);
      if (response.success) {
        toast.success("Category removed.");
        await fetchCategories();
      } else {
        toast.error(response.message ?? "Failed to remove category.");
      }
    } catch {
      toast.error("Failed to remove category.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const visibleDefaults = categories.filter((c) => c.type === "default");
  const customCats = categories.filter((c) => c.type === "custom");

  const categoriesTourSteps = [
    {
      element: "[data-tour='categories-add']",
      popover: {
        title: "Add Custom Category",
        description: "Create custom categories for your documents. They will appear in the upload dropdown alongside default categories.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    {
      element: "[data-tour='categories-defaults']",
      popover: {
        title: "Default Categories",
        description: "These are system categories. Toggle Hide to remove them from your upload list. They remain available to restore.",
        side: "bottom" as const,
        align: "center" as const,
      },
    },
    {
      element: "[data-tour='categories-custom']",
      popover: {
        title: "Your Custom Categories",
        description: "Categories you've added. You can delete custom categories that are no longer needed.",
        side: "top" as const,
        align: "center" as const,
      },
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <PageTour pageId="categories" steps={categoriesTourSteps} runOnMount />
      <AppNav />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Categories</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-1">
            Add custom categories or show/hide default ones. These options appear when uploading documents.
          </p>
          <p className="text-slate-500 dark:text-slate-500 text-sm">
            Categories are private to your account. Other admins cannot see or change your categories.
          </p>
        </div>

        {/* Add custom category */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8" data-tour="categories-add">
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
            {/* Default categories (visible) — list with hide toggle */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-6" data-tour="categories-defaults">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FolderTree className="w-5 h-5" />
                  Default categories ({visibleDefaults.length})
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Shown when uploading documents. Toggle off to hide from your list.
                </p>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleDefaults.length === 0 ? (
                  <li className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                    No default categories visible. Unhide some from the section below.
                  </li>
                ) : (
                  visibleDefaults.map((c) => (
                    <li
                      key={`default-${c.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <span className="font-medium text-slate-900 dark:text-white truncate">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => hideDefault(Number(c.id))}
                        disabled={!!actionLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                        title="Hide from upload list"
                      >
                        {actionLoading === `hide-${c.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                        Hide
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Custom categories */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-6" data-tour="categories-custom">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Your custom categories ({customCats.length})
                </h2>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {customCats.length === 0 ? (
                  <li className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                    No custom categories. Add one above.
                  </li>
                ) : (
                  customCats.map((c) => (
                    <li
                      key={`custom-${c.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <span className="font-medium text-slate-900 dark:text-white truncate">{c.name}</span>
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
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Hidden default categories — unhide toggle */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <EyeOff className="w-5 h-5" />
                  Hidden default categories ({hiddenDefaults.length})
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Unhide to show them again in the default list and when uploading.
                </p>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {hiddenDefaults.length === 0 ? (
                  <li className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                    None hidden. Use &quot;Hide&quot; on any default category above to add it here.
                  </li>
                ) : (
                  hiddenDefaults.map((h) => (
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
                        title="Show in upload list"
                      >
                        {actionLoading === `unhide-${h.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                        Unhide
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}