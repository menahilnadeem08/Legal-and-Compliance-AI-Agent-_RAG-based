"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { User, Mail, AtSign, Shield, CheckCircle, Key, LogOut, X } from "lucide-react";
import { getAuthToken, getRefreshToken, getAuthUser, getAuthTokenForApi, clearAuth, setAuth, isEmployeeUser, AUTH_LOGIN_REDIRECT } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";
import { mapFieldErrors } from "@/app/utils/formErrors";
import { PasswordInput } from "@/app/components/PasswordInput";
import { isPasswordValid } from "@/app/utils/passwordValidation";

type UserInfo = {
  username: string;
  email: string;
  name: string;
  role: "employee" | "admin" | "viewer";
  status: string;
  authMethod: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    const stored = getAuthUser();
    if (stored) {
      setUser({
        username: stored.username ?? stored.email ?? "User",
        email: stored.email ?? "",
        name: stored.name ?? stored.username ?? "",
        role: (stored.role as "employee" | "admin" | "viewer") ?? "employee",
        status: "Active",
        authMethod: stored.role === "employee" ? "Local Login" : "Admin",
      });
    } else if (!getAuthToken()) {
      router.replace(AUTH_LOGIN_REDIRECT);
      return;
    }
    setLoading(false);
  }, [router]);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalMessage(null);
    setFieldErrors({});
    if (newPassword !== confirmPassword) {
      setModalMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setModalMessage({ type: "error", text: "New password must be at least 8 characters with uppercase, lowercase, number, and special character." });
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await api.post<{ accessToken?: string; refreshToken?: string }>("/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (response.success && response.data?.accessToken) {
        const currentUser = getAuthUser();
        setAuth(response.data.accessToken, currentUser ?? {}, response.data.refreshToken);
        setModalMessage({ type: "success", text: "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setPasswordModalOpen(false);
          setModalMessage(null);
        }, 1500);
      } else {
        setModalMessage({ type: "error", text: response.message ?? "Failed to change password." });
        if (response.errors) setFieldErrors(mapFieldErrors(response.errors));
      }
    } catch (err) {
      console.error(err);
      setModalMessage({ type: "error", text: "An error occurred while changing password." });
    } finally {
      setPasswordLoading(false);
    }
  };

  const getFieldError = (field: string) => fieldErrors[field] ?? fieldErrors[`body.${field}`];

  const closePasswordModal = () => {
    setPasswordModalOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setModalMessage(null);
    setFieldErrors({});
  };

  const handleLogoutConfirm = async () => {
    setLogoutConfirmOpen(false);
    const refresh = getRefreshToken();
    try {
      await api.post("/auth/logout", { refreshToken: refresh });
    } catch (err) {
      console.error(err);
    }
    clearAuth();
    router.replace(AUTH_LOGIN_REDIRECT);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <AppNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-8">Profile</h1>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <AtSign className="w-4 h-4" />
                Username
              </span>
              <span className="text-slate-900 dark:text-white font-medium">{user.username}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <Mail className="w-4 h-4" />
                Email
              </span>
              <span className="text-slate-900 dark:text-white font-medium">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <User className="w-4 h-4" />
                Full Name
              </span>
              <span className="text-slate-900 dark:text-white font-medium">{user.name}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                <Shield className="w-4 h-4" />
                Role
              </span>
              <span className="text-slate-900 dark:text-white font-medium capitalize">{user.role}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                Status
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle className="w-4 h-4" />
                {user.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
                Authentication method
              </span>
              <span className="text-slate-900 dark:text-white font-medium">{user.authMethod}</span>
            </div>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
            {isEmployeeUser() && (
              <button
                type="button"
                onClick={() => setPasswordModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-medium text-sm"
              >
                <Key className="w-4 h-4" />
                Change Password
              </button>
            )}
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-medium text-sm"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </main>

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-semibold">Change Password</h2>
              <button
                type="button"
                onClick={closePasswordModal}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePasswordSubmit} className="p-4 space-y-4">
              {modalMessage && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    modalMessage.type === "success"
                      ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                  }`}
                >
                  {modalMessage.text}
                </div>
              )}
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                label="Current password"
                placeholder="Enter current password"
                autoComplete="current-password"
                disabled={passwordLoading}
                error={getFieldError("currentPassword")}
                variant="compact"
                className=""
              />
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                label="New password"
                placeholder="Enter new password"
                autoComplete="new-password"
                disabled={passwordLoading}
                error={getFieldError("newPassword")}
                showValidation
                variant="compact"
                className=""
              />
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                label="Confirm new password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                disabled={passwordLoading}
                error={getFieldError("confirmPassword")}
                confirmValue={newPassword}
                variant="compact"
                className=""
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  disabled={passwordLoading}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                >
                  {passwordLoading ? "Updating…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logout confirmation */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-2">Log out?</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              You will be redirected to the login page.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
