"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { getAuthToken, setAuth } from "@/app/utils/auth";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    const sessionAccessToken = (session?.user as any)?.accessToken;
    if (session?.user && sessionAccessToken) {
      setAuth(
        sessionAccessToken,
        { ...session.user, role: "admin" },
        (session.user as any)?.refreshToken
      );
      router.replace("/dashboard");
      return;
    }
    if (getAuthToken()) router.replace("/dashboard");
  }, [session, status, router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      await signIn("google", { callbackUrl: "/auth/login" });
    } catch (err) {
      setError("Sign-in failed. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Legal Compliance
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-2">
            Admin sign in
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-center text-sm mb-8">
            Sign in with Google or use admin email/password below.
          </p>

          {error && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-800 dark:text-slate-200 font-medium py-3 px-4 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
            </svg>
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <Link
              href="/auth/admin/login"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium underline-offset-2 hover:underline"
            >
              Admin login (email/password)
            </Link>
            <span className="text-slate-400 dark:text-slate-500">·</span>
            <Link
              href="/auth/admin/signup"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium underline-offset-2 hover:underline"
            >
              Admin register
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-400">
            Employee?{" "}
            <Link
              href="/auth/employee-login"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium underline-offset-2 hover:underline"
            >
              Employee login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
