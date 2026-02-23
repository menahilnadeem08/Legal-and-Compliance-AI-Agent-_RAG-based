"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { getAuthToken, getAuthTokenForApi, getApiBase, clearAuth, isAdminUser } from "@/app/utils/auth";

const DOCUMENT_TYPES = [
  "Policy",
  "Contract",
  "Regulation",
  "Guideline",
  "Procedure",
  "Compliance Notice",
  "Other",
] as const;

const TYPE_TO_API = (t: string): string => {
  const map: Record<string, string> = {
    Policy: "policy",
    Contract: "contract",
    Regulation: "regulation",
    Guideline: "guideline",
    Procedure: "other",
    "Compliance Notice": "other",
    Other: "other",
  };
  return map[t] ?? "policy";
};

type SubmitState = "idle" | "loading" | "success" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0]);
  const [title, setTitle] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    setFile(chosen ?? null);
    if (submitState !== "idle") setSubmitState("idle");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setSubmitState("error");
      setMessage("Please select a file.");
      return;
    }

    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }

    setSubmitState("loading");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", TYPE_TO_API(documentType));

    try {
      const res = await fetch(`${getApiBase()}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (res.status === 403) {
        setSubmitState("error");
        setMessage("Only admins can upload documents.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitState("error");
        setMessage(data.error ?? "Upload failed. Please try again.");
        return;
      }

      setSubmitState("success");
      setMessage(`"${file.name}" uploaded successfully.`);
      setFile(null);
      setTitle("");
      setDocumentType(DOCUMENT_TYPES[0]);
      const input = document.getElementById("file-input") as HTMLInputElement;
      if (input) input.value = "";
    } catch (err) {
      setSubmitState("error");
      setMessage("Upload failed. Please try again.");
      console.error(err);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <AppNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-2">Upload Document</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Add a PDF or DOCX file and choose a document type. Admin only.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <label htmlFor="file-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                File
              </label>
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50 cursor-pointer transition-colors">
                  <Upload className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {file ? file.name : "Choose PDF or DOCX"}
                  </span>
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Accepted: .pdf, .docx
              </p>
            </div>

            <div>
              <label htmlFor="document-type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Document type
              </label>
              <select
                id="document-type"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Title <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 Compliance Policy"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {(submitState === "success" || submitState === "error") && message && (
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
                submitState === "success"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
              }`}
            >
              {submitState === "success" ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitState === "loading"}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium"
          >
            {submitState === "loading" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Submit
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
