"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { getAuthToken, isAdminUser } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";

/** Categories sent to backend; version is auto-assigned per category. */
const DOCUMENT_CATEGORIES = [
  "Federal Legislation / Acts",
  "Policy",
  "Contract",
  "Regulation",
  "Guideline",
  "Procedure",
  "Compliance Notice",
  "Other",
] as const;

type SubmitState = "idle" | "loading" | "success" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth/login");
      return;
    }
    if (!isAdminUser()) {
      router.replace("/");
      return;
    }
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

    setSubmitState("loading");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    try {
      const response = await api.postFormData<{ documentId?: string }>("/upload", formData);
      if (response.success) {
        setSubmitState("success");
        setMessage(response.message ?? `"${file.name}" uploaded successfully.`);
        setFile(null);
        setTitle("");
        setCategory(DOCUMENT_CATEGORIES[0]);
      } else {
        setSubmitState("error");
        setMessage(response.message ?? "Upload failed. Please try again.");
      }
      const input = document.getElementById("file-input") as HTMLInputElement;
      if (input) input.value = "";
    } catch (err) {
      setSubmitState("error");
      setMessage("Upload failed. Please try again.");
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <AppNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-2">Upload Document</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Add a PDF or DOCX file and choose a category. Version is assigned automatically per category. Admin only.
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
              <label htmlFor="document-category" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <select
                id="document-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
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
