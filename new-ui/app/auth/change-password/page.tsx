"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, Sparkles, AlertCircle, CheckCircle } from "lucide-react";
import { setAuth, getAuthToken, getAuthTokenForApi, getAuthUser, clearAuth, getApiBase } from "../../utils/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

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
    if (formData.newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      setLoading(false);
      return;
    }
    const hasUppercase = /[A-Z]/.test(formData.newPassword);
    const hasLowercase = /[a-z]/.test(formData.newPassword);
    const hasNumber = /[0-9]/.test(formData.newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/.test(formData.newPassword);
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      setError("Password must contain uppercase, lowercase, number, and special character");
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
      const token = getAuthTokenForApi();
      if (!token) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      const response = await fetch(`${getApiBase()}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (!response.ok) {
        setError(data.error || "Failed to change password");
        setLoading(false);
        return;
      }

      if (data.accessToken) {
        const user = getAuthUser();
        setAuth(data.accessToken, user || {}, data.refreshToken);
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("forcePasswordChange");
        document.cookie = "force-password-change=; path=/; max-age=0; SameSite=Lax";
      }
      setSuccess("Password changed successfully! Redirecting...");
      setFormData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => router.replace("/dashboard"), 2000);
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
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Current password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="password"
                    id="currentPassword"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    placeholder="Enter your current password"
                    disabled={loading}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  placeholder="Min 8 characters"
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Uppercase, lowercase, number, special character
              </p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm new password"
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
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
