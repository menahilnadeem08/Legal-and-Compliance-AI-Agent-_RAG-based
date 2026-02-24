"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/app/theme-provider";
import Link from "next/link";
import {
  LogOut,
  FileText,
  MessageSquare,
  Settings,
  Gavel,
  Moon,
  Sun,
  User,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthToken, getAuthUser, clearAuth, isAdminUser } from "@/app/utils/auth";

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();
  const [user, setUser] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth/login");
      return;
    }
    const authUser = getAuthUser();
    setUser({
      name: authUser?.name ?? authUser?.username ?? authUser?.email ?? "User",
      email: authUser?.email ?? "",
    });
    setAuthChecked(true);
  }, [router]);

  const handleLogout = () => {
    clearAuth();
    toast.success("Logged out successfully");
    router.push("/");
  };

  if (!mounted || !authChecked) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-50 shadow-sm dark:shadow-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">Legal RAG</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-700" />
              )}
            </button>
            <Link
              href="/profile"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              aria-label="Profile"
            >
              <User className="w-5 h-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-medium text-sm text-white flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.name ?? "User"}! 👋</h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Your Legal RAG Dashboard
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <Link
              href="/documents"
              className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-900/10 rounded-lg p-6 border border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors block"
            >
              <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Documents</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">0</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">View library →</p>
            </Link>
            <Link
              href="/chat"
              className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-900/10 rounded-lg p-6 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors block"
            >
              <MessageSquare className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Queries</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">0</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Open Chat →</p>
            </Link>
            {isAdminUser() && (
              <Link
                href="/upload"
                className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-900/10 rounded-lg p-6 border border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 transition-colors block"
              >
                <Upload className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Documents upload</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">Upload</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Add document →</p>
              </Link>
            )}
            <Link
              href="/profile"
              className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-900/10 rounded-lg p-6 border border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors block"
            >
              <Settings className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Settings</p>
              <p className="text-emerald-600 dark:text-emerald-400 hover:underline text-sm font-medium mt-1">
                Profile
              </p>
            </Link>
          </div>

          {/* Placeholder Content */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 p-8">
            <h2 className="text-2xl font-bold mb-4">Getting Started</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Your dashboard is ready! Here's what you can do:
            </p>
            <ul className="space-y-2 text-slate-600 dark:text-slate-400">
              <li>• Upload and manage legal documents</li>
              <li>• Query your document knowledge base with AI</li>
              <li>• View compliance insights and analytics</li>
              <li>• Configure your organization settings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
