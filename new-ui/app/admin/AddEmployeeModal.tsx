"use client";

import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { getAuthTokenForApi, getApiBase } from "@/app/utils/auth";

type AddEmployeeModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onUnauthorized?: () => void;
};

export function AddEmployeeModal({ open, onClose, onSuccess, onUnauthorized }: AddEmployeeModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (!trimmedUsername) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage("Email is required.");
      return;
    }
    const token = getAuthTokenForApi();
    if (!token) {
      onUnauthorized?.();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/admin/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          name: name.trim() || "",
        }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? "Failed to create employee.");
        return;
      }
      setUsername("");
      setEmail("");
      setName("");
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMessage("An error occurred while creating employee.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setUsername("");
    setEmail("");
    setName("");
    setErrorMessage(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold">Add Employee</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div>
            <label htmlFor="add-employee-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              id="add-employee-username"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setErrorMessage(null); }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. jane.doe"
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="add-employee-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="add-employee-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. jane@example.com"
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="add-employee-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Full Name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="add-employee-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Jane Doe"
              disabled={submitting}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
