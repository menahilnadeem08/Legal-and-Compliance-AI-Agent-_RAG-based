"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import {
  FileText,
  Scale,
  BookOpen,
  Shield,
  Trash2,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { getAuthToken, isAdminUser, AUTH_LOGIN_REDIRECT } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";
import { parseAsUTC } from "@/app/utils/date";
import { DocumentPreviewModal } from "@/app/components/DocumentPreviewModal";
import { PageTour } from "@/app/components/PageTour";

type DocType = "contract" | "regulation" | "case_law" | "policy" | "guideline" | "other";

/** Matches backend list: id, filename, category, version, is_active, upload_date */
type DocumentItem = {
  id: string;
  name: string;
  type: string;
  version: string;
  upload_date: string;
  is_latest: boolean;
};

type ApiDocument = {
  id: string;
  filename?: string;
  category?: string;
  version?: string | number;
  is_active?: boolean;
  upload_date?: string;
};
function mapDocFromApi(doc: ApiDocument): DocumentItem {
  return {
    id: doc.id,
    name: doc.filename ?? "Document",
    type: doc.category ?? "other",
    version: doc.version != null ? String(doc.version) : "—",
    upload_date: doc.upload_date ?? "",
    is_latest: doc.is_active ?? false,
  };
}

type TabId = "all" | "latest" | "outdated";

const DEFAULT_TYPE_CONFIG = {
  label: "Document",
  icon: FileText,
  gradient: "from-slate-500 to-slate-700 dark:from-slate-600 dark:to-slate-800",
  border: "border-slate-200 dark:border-slate-800",
};

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; gradient: string; border: string }
> = {
  contract: {
    label: "Contract",
    icon: FileText,
    gradient: "from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-800",
    border: "border-blue-200 dark:border-blue-800",
  },
  regulation: {
    label: "Regulation",
    icon: Scale,
    gradient: "from-violet-500 to-violet-700 dark:from-violet-600 dark:to-violet-800",
    border: "border-violet-200 dark:border-violet-800",
  },
  case_law: {
    label: "Case Law",
    icon: BookOpen,
    gradient: "from-amber-500 to-amber-700 dark:from-amber-600 dark:to-amber-800",
    border: "border-amber-200 dark:border-amber-800",
  },
  policy: {
    label: "Policy",
    icon: Shield,
    gradient: "from-emerald-500 to-emerald-700 dark:from-emerald-600 dark:to-emerald-800",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  guideline: {
    label: "Guideline",
    icon: FileText,
    gradient: "from-teal-500 to-teal-700 dark:from-teal-600 dark:to-teal-800",
    border: "border-teal-200 dark:border-teal-800",
  },
  other: {
    ...DEFAULT_TYPE_CONFIG,
    label: "Other",
  },
};

function getTypeConfig(type: string) {
  const key = (type || "").toLowerCase();
  return TYPE_CONFIG[key] ?? { ...DEFAULT_TYPE_CONFIG, label: type || "Document" };
}

export default function DocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentItem | null>(null);

  useEffect(() => {
    setIsAdmin(isAdminUser());
  }, []);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ documents?: ApiDocument[] }>("/documents");
      if (response.success && response.data?.documents != null) {
        setDocuments(response.data.documents.map((d: ApiDocument) => mapDocFromApi(d)));
      } else {
        setError(response.message ?? "Failed to load documents.");
        setDocuments([]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load documents. Please try again.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace(AUTH_LOGIN_REDIRECT);
      return;
    }
    fetchDocuments();
  }, [router]);

  const filtered = documents.filter((doc) => {
    if (activeTab === "latest") return doc.is_latest;
    if (activeTab === "outdated") return !doc.is_latest;
    return true;
  });

  const latestCount = documents.filter((d) => d.is_latest).length;

  const handleToggleActive = async (doc: DocumentItem) => {
    if (!isAdmin) return;
    const makeActive = !doc.is_latest;
    setToggling(doc.id);
    try {
      const action = makeActive ? "activate" : "deactivate";
      const response = await api.put(`/documents/${doc.id}/${action}`);
      if (response.success) {
        await fetchDocuments();
        setSuccessMessage(`Document ${makeActive ? "activated" : "deactivated"} successfully.`);
      } else setError(response.message ?? "Failed to update document status.");
    } catch (err) {
      console.error(err);
      setError("Failed to update document status.");
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      const response = await api.delete(`/documents/${deleteTarget.id}`);
      if (response.success) {
        setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        setDeleteTarget(null);
        setSuccessMessage("Document deleted successfully.");
      } else {
        setError(response.message ?? "Failed to delete document.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to delete document.");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  const documentsTourSteps = [
    {
      element: "[data-tour='documents-tabs']",
      route: "/documents",
      popover: {
        title: "Filter Documents",
        description: "View all documents, only the latest versions, or outdated ones. Latest versions are used by the AI for answers.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    {
      element: "[data-tour='documents-content']",
      route: "/documents",
      popover: {
        title: "Document Library",
        description: "Browse and manage your uploaded documents. Click to preview, or use the actions to activate/deactivate or delete.",
        side: "top" as const,
        align: "center" as const,
      },
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <PageTour pageId="documents" steps={documentsTourSteps} runOnMount autoAdvanceOnTargetClick />
      <AppNav />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Document Library</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Browse and manage uploaded documents.
            </p>
          </div>
        </div>
        {successMessage && (
          <div className="mb-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-4 py-3 flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-6" data-tour="documents-tabs">
          {(
            [
              { id: "all" as const, label: "All Documents" },
              { id: "latest" as const, label: "Latest Versions" },
              { id: "outdated" as const, label: "Outdated" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
            <FileText className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No documents found</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {activeTab === "all"
                ? "Upload a document to get started."
                : "No documents match this filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="documents-content">
            {filtered.map((doc) => {
              const config = getTypeConfig(doc.type);
              const Icon = config.icon;
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewDocument(doc)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreviewDocument(doc);
                    }
                  }}
                  className={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden cursor-pointer transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${config.border}`}
                >
                  <div
                    className={`h-2 bg-gradient-to-r ${config.gradient}`}
                    aria-hidden
                  />
                  <div className="p-4 space-y-4">
                    {/* Name + Icon */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-white truncate" title={doc.name}>
                          {doc.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {config.label}
                        </p>
                      </div>
                    </div>

                    {/* Details: Status, Date uploaded, Version */}
                    <dl className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex justify-between items-center gap-2">
                        <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                        <dd>
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              doc.is_latest
                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {doc.is_latest ? "Latest" : "Outdated"}
                          </span>
                        </dd>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <dt className="text-slate-500 dark:text-slate-400">Date uploaded</dt>
                        <dd className="text-slate-700 dark:text-slate-300 font-medium">
                          {doc.upload_date
                            ? parseAsUTC(doc.upload_date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <dt className="text-slate-500 dark:text-slate-400">Version</dt>
                        <dd className="text-slate-700 dark:text-slate-300 font-medium">
                          v{doc.version}
                        </dd>
                      </div>
                    </dl>

                    {/* Active / Inactive — admin only */}
                    {isAdminUser() && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(doc);
                          }}
                          disabled={toggling === doc.id || deleting === doc.id}
                          className="flex items-center gap-2 w-full text-left text-sm rounded-lg py-2 px-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-50"
                        >
                          {toggling === doc.id ? (
                            <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                          ) : doc.is_latest ? (
                            <ToggleRight className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          )}
                          <span className={doc.is_latest ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-500 dark:text-slate-400"}>
                            {toggling === doc.id ? "Updating…" : doc.is_latest ? "Active" : "Inactive"}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Delete — admin only */}
                    {isAdminUser() && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(doc);
                          }}
                          disabled={deleting === doc.id}
                          className="flex items-center gap-2 w-full text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg py-2 px-3 disabled:opacity-50"
                        >
                          {deleting === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>Total: {filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
          {activeTab === "all" && (
            <span>Latest versions: {latestCount}</span>
          )}
        </footer>
      </main>

      {/* Document preview modal */}
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-2">Delete document?</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              &quot;{deleteTarget.name}&quot; will be removed from the list. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={!!deleting}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!!deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
