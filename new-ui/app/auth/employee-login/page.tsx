"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Lock, ArrowRight, Sparkles, AlertCircle } from "lucide-react";
import { PasswordInput } from "../../components/PasswordInput";
import { toast } from "sonner";
import { setAuth, getAuthUser } from "../../utils/auth";
import { api } from "../../utils/apiClient";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getAuthUser();
    if (user && user.role === "employee") router.replace("/");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Please enter username and password.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post<{ accessToken?: string; refreshToken?: string; user?: object; forcePasswordChange?: boolean }>(
        "/auth/login",
        { username: username.trim(), password },
        { requiresAuth: false }
      );

      if (!response.success) {
        setError(response.message ?? "Login failed");
        toast.error("Sign in failed.");
        return;
      }

      const data = response.data;
      if (!data?.accessToken || !data?.user) {
        setError("Invalid response from server.");
        return;
      }

      setAuth(data.accessToken, data.user, data.refreshToken);

      if (data.forcePasswordChange) {
        if (typeof window !== "undefined") {
          localStorage.setItem("forcePasswordChange", "true");
          document.cookie = "force-password-change=true; path=/; max-age=2592000; SameSite=Lax";
        }
        toast.success("Please change your password first.");
        router.push("/auth/change-password");
      } else {
        toast.success("Signed in successfully.");
        router.push("/");
      }
    } catch (err) {
      setError("An error occurred during login");
      toast.error("Sign in failed.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-950 flex-col justify-between p-12">
        <div
          className="absolute inset-0 opacity-5 dark:opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400 dark:bg-blue-400 rounded-full blur-[120px] opacity-10 dark:opacity-25" />
        <div className="absolute bottom-20 left-10 w-72 h-72 bg-indigo-600 dark:bg-indigo-600 rounded-full blur-[100px] opacity-10 dark:opacity-20" />

        <div className="relative z-10 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 dark:bg-white rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white dark:text-blue-900" />
          </div>
          <span className="text-blue-900 dark:text-white font-bold text-xl tracking-tight">
            Legal and Compliance Rag
          </span>
        </div>

        <div className="relative z-10">
          <h2 className="text-5xl font-bold text-blue-900 dark:text-white leading-tight mb-4">
            Employee
            <br />
            sign in
          </h2>
          <p className="text-blue-700 dark:text-blue-200 text-lg leading-relaxed max-w-sm">
            Sign in with your username and password to access the Legal RAG workspace.
          </p>
        </div>

        <p className="relative z-10 text-blue-700 dark:text-blue-300 text-sm">
          Use username: <span className="font-semibold text-blue-900 dark:text-white">employee</span>, password: <span className="font-semibold text-blue-900 dark:text-white">employee</span> to try.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-slate-900 dark:text-white font-bold text-xl tracking-tight">
              Legal and Compliance Rag
            </span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              Employee login
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Admin?{" "}
              <Link
                href="/auth/admin/login"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors underline-offset-2 hover:underline"
              >
                Admin login
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div className="flex items-start gap-2.5 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl px-4 py-3 animate-[fadeIn_0.2s_ease]">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <PasswordInput
              id="password"
              value={password}
              onChange={(v) => { setPassword(v); setError(""); }}
              label="Password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading}
              className="space-y-1.5"
            />

            <p className="text-sm text-slate-600 dark:text-slate-400 -mt-1">
              <Link
                href="/auth/forgot-password?returnTo=employee"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 dark:active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              {loading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
              )}
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
