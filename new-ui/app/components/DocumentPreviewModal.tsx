"use client";

import { useEffect, useCallback, useState } from "react";
import { X, ExternalLink, Download, Loader2, FileText } from "lucide-react";
import { getApiBase, getAuthTokenForApi } from "@/app/utils/auth";
import { parseAsUTC } from "@/app/utils/date";

export type DocumentItem = {
  id: string;
  name: string;
  type: string;
  version: string;
  upload_date: string;
  is_latest: boolean;
};

type PreviewKind = "pdf" | "word" | "other";

function getPreviewKind(filename: string): PreviewKind {
  const ext = (filename || "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "doc" || ext === "docx") return "word";
  return "other";
}

type Props = {
  document: DocumentItem;
  onClose: () => void;
};

export function DocumentPreviewModal({ document: doc, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const kind = getPreviewKind(doc.name);

  const fetchBlob = useCallback(async () => {
    const token = getAuthTokenForApi();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base = getApiBase();
      const url = `${base}/documents/${doc.id}/download`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || `Failed to load file (${res.status})`);
      }
      const contentType = res.headers.get("Content-Type") ?? "";
      if (kind === "pdf" && !contentType.includes("application/pdf")) {
        throw new Error("Server did not return a PDF. The file may be missing or corrupted.");
      }
      const blob = await res.blob();
      const mimeType = kind === "pdf" ? "application/pdf" : contentType.split(";")[0].trim() || blob.type || "";
      const typedBlob = mimeType ? new Blob([await blob.arrayBuffer()], { type: mimeType }) : blob;
      const urlObj = URL.createObjectURL(typedBlob);
      setBlobUrl(urlObj);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [doc.id]);

  useEffect(() => {
    if (kind === "other") {
      setLoading(false);
      return;
    }
    fetchBlob();
  }, [kind, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  const openInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } else {
      const token = getAuthTokenForApi();
      if (token) {
        const url = `${getApiBase()}/documents/${doc.id}/download`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };

  const download = async () => {
    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = doc.name || "document";
      a.rel = "noopener noreferrer";
      a.click();
      return;
    }
    const token = getAuthTokenForApi();
    if (!token) return;
    try {
      setLoading(true);
      const base = getApiBase();
      const res = await fetch(`${base}/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = doc.name || "document";
      a.rel = "noopener noreferrer";
      a.click();
      URL.revokeObjectURL(urlObj);
    } catch {
      setError("Download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = doc.is_latest ? "Latest" : "Outdated";
  const uploadDateFormatted = doc.upload_date
    ? parseAsUTC(doc.upload_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow"
        style={{ minHeight: "56px" }}
      >
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <FileText className="w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <h2 id="preview-title" className="font-semibold text-slate-900 dark:text-white truncate">
              {doc.name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                className={`inline-block px-2 py-0.5 rounded ${
                  doc.is_latest
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                {statusLabel}
              </span>
              <span>v{doc.version}</span>
              <span>{uploadDateFormatted}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {kind === "pdf" && (
            <button
              type="button"
              onClick={openInNewTab}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </button>
          )}
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Content area: calc(100vh - header) */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4"
        style={{ height: "calc(100vh - 56px)" }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin" />
            <p>Loading document…</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-6 py-4 max-w-md text-center">
            <p className="font-medium">Could not load document</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              type="button"
              onClick={fetchBlob}
              className="mt-3 px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-800 dark:text-red-200 text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && kind === "pdf" && blobUrl && (
          <div className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-white shadow-lg">
            <iframe
              src={blobUrl}
              title={doc.name}
              className="flex-1 w-full min-h-0 rounded-lg border-0"
              style={{ minHeight: "calc(100vh - 56px - 2rem)" }}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-2 px-4">
              If the PDF doesn&apos;t appear, use &quot;Open in New Tab&quot; or &quot;Download&quot; above.
            </p>
          </div>
        )}

        {!loading && !error && kind === "word" && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-8 max-w-md w-full text-center">
            <FileText className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
            <p className="font-medium text-slate-900 dark:text-white">Word document</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Use &quot;Download&quot; to open in Word or another app.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-left text-sm text-slate-600 dark:text-slate-300">
              <p><strong>File:</strong> {doc.name}</p>
              <p><strong>Status:</strong> {statusLabel}</p>
              <p><strong>Version:</strong> v{doc.version}</p>
              <p><strong>Uploaded:</strong> {uploadDateFormatted}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        )}

        {!loading && !error && kind === "other" && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-8 max-w-md w-full text-center">
            <FileText className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
            <p className="font-medium text-slate-900 dark:text-white">Preview not available for this file type</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              You can download the file to open it in your preferred application.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-left text-sm text-slate-600 dark:text-slate-300">
              <p><strong>File:</strong> {doc.name}</p>
              <p><strong>Status:</strong> {statusLabel}</p>
              <p><strong>Version:</strong> v{doc.version}</p>
              <p><strong>Uploaded:</strong> {uploadDateFormatted}</p>
            </div>
            <button
              type="button"
              onClick={download}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
