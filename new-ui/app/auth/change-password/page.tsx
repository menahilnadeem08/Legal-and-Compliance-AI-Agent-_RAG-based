"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, AlertCircle, CheckCircle } from "lucide-react";
import { setAuth, getAuthToken, getAuthUser } from "../../utils/auth";
import { api } from "../../utils/apiClient";
import { mapFieldErrors } from "../../utils/formErrors";
import { PasswordInput } from "../../components/PasswordInput";
import { isPasswordValid } from "../../utils/passwordValidation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isForcedPasswordChange, setIsForcedPasswordChange] = useState(false);
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const token = getAuthToken();
    const forcePasswordChange =
      typeof window !== "undefined" && localStorage.getItem("forcePasswordChange") === "true";
    if (token) {
      setIsForcedPasswordChange(forcePasswordChange);
      setIsAuthLoading(false);
    } else {
      router.replace("/auth/employee-login");
    }
  }, [router]);

  const setFormField = (name: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setFieldErrors({});

    if (!formData.newPassword || !formData.confirmPassword) {
      setError("New password and confirm password are required");
      setLoading(false);
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setError("New passwords do not match");
      setLoading(false);
      return;
    }
    if (!isPasswordValid(formData.newPassword)) {
      setError("Password must be at least 8 characters with uppercase, lowercase, number, and special character");
      setLoading(false);
      return;
    }
    if (!isForcedPasswordChange && !formData.currentPassword) {
      setError("Current password is required");
      setLoading(false);
      return;
    }

    const body: Record<string, string> = {
      newPassword: formData.newPassword,
      confirmPassword: formData.confirmPassword,
    };
    if (!isForcedPasswordChange) body.currentPassword = formData.currentPassword;

    try {
      const response = await api.post<{ accessToken?: string; refreshToken?: string }>("/auth/change-password", body);
      if (response.success && response.data?.accessToken) {
        const user = getAuthUser();
        setAuth(response.data.accessToken, user || {}, response.data.refreshToken);
        if (typeof window !== "undefined") {
          localStorage.removeItem("forcePasswordChange");
          document.cookie = "force-password-change=; path=/; max-age=0; SameSite=Lax";
        }
        setSuccess("Password changed successfully! Redirecting...");
        setFormData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => router.replace("/dashboard"), 2000);
      } else {
        setError(response.message ?? "Failed to change password");
        if (response.errors) setFieldErrors(mapFieldErrors(response.errors));
      }
    } catch (err) {
      setError("An error occurred while changing password");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Legal Compliance
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
            {isForcedPasswordChange ? "Set your password" : "Change password"}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
            {isForcedPasswordChange
              ? "You must set a new password before continuing."
              : "Set a new password for your account."}
          </p>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2.5 bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/50 rounded-xl px-4 py-3 mb-4">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-emerald-700 dark:text-emerald-300 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            {!isForcedPasswordChange && (
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                value={formData.currentPassword}
                onChange={setFormField("currentPassword")}
                label="Current password"
                placeholder="Enter your current password"
                autoComplete="current-password"
                disabled={loading}
                error={fieldErrors.currentPassword}
              />
            )}
            <PasswordInput
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={setFormField("newPassword")}
              label="New password"
              placeholder="Min 8 characters"
              autoComplete="new-password"
              disabled={loading}
              error={fieldErrors.newPassword}
              showValidation
            />
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={setFormField("confirmPassword")}
              label="Confirm password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              disabled={loading}
              error={fieldErrors.confirmPassword}
              confirmValue={formData.newPassword}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <>
                  Change password
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            <Link href="/auth/employee-login" className="text-blue-600 dark:text-blue-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
