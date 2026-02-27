"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/app/theme-provider";
import Link from "next/link";
import {
  LogOut,
  FileText,
  MessageSquare,
  Gavel,
  Moon,
  Sun,
  User,
  Upload,
  FolderOpen,
  Users,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthToken, getAuthUser, clearAuth, isAdminUser, AUTH_LOGIN_REDIRECT } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";
import { StartupGuide, type StartupGuideRef } from "@/app/components/StartupGuide";

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();
  const [user, setUser] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [documentCount, setDocumentCount] = useState<number>(0);
  const [conversationCount, setConversationCount] = useState<number>(0);
  const [categoryCount, setCategoryCount] = useState<number>(0);
  const [employeeCount, setEmployeeCount] = useState<number>(0);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace(AUTH_LOGIN_REDIRECT);
      return;
    }
    const authUser = getAuthUser();
    setUser({
      name: authUser?.name ?? authUser?.username ?? authUser?.email ?? "User",
      email: authUser?.email ?? "",
    });
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked || !getAuthToken()) return;
    (async () => {
      const [docRes, convRes] = await Promise.all([
        api.get<{ documents?: unknown[] }>("/documents"),
        api.get<{ conversations?: unknown[]; total?: number }>("/conversations"),
      ]);
      if (docRes.success && docRes.data?.documents) {
        setDocumentCount(docRes.data.documents.length);
      }
      if (convRes.success) {
        const count = convRes.data?.total ?? convRes.data?.conversations?.length ?? 0;
        setConversationCount(count);
      }
      if (isAdminUser()) {
        const [catRes, empRes] = await Promise.all([
          api.get<{ categories?: unknown[] }>("/categories"),
          api.get<{ employees?: unknown[] }>("/admin/employees"),
        ]);
        if (catRes.success && catRes.data?.categories) {
          setCategoryCount(catRes.data.categories.length);
        }
        if (empRes.success && empRes.data) {
          const list = empRes.data.employees;
          setEmployeeCount(Array.isArray(list) ? list.length : 0);
        }
      }
    })();
  }, [authChecked]);

  const handleLogout = () => {
    clearAuth();
    toast.success("Logged out successfully");
    router.push("/");
  };

  const startupGuideRef = useRef<StartupGuideRef>(null);

  if (!mounted || !authChecked) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      <StartupGuide ref={startupGuideRef} isAdmin={isAdminUser()} runOnMount />

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
          <div className="mb-12" data-tour="welcome">
            <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.name ?? "User"}! 👋</h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Your Legal RAG Dashboard
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap justify-center gap-6 mb-12">
            <Link
              href="/documents"
              data-tour="documents"
              className="w-full sm:w-[280px] bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-900/10 rounded-lg p-6 border border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors block"
            >
              <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Documents</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{documentCount}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">View library →</p>
            </Link>
            <Link
              href="/chat"
              data-tour="chat"
              className="w-full sm:w-[280px] bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-900/10 rounded-lg p-6 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors block"
            >
              <MessageSquare className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Queries</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{conversationCount}</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Open Chat →</p>
            </Link>
            {isAdminUser() && (
              <Link
                href="/upload"
                data-tour="upload"
                className="w-full sm:w-[280px] bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-900/10 rounded-lg p-6 border border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 transition-colors block"
              >
                <Upload className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Documents upload</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">Upload</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Add document →</p>
              </Link>
            )}
            {isAdminUser() && (
              <Link
                href="/categories"
                data-tour="categories"
                className="w-full sm:w-[280px] bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-900/10 rounded-lg p-6 border border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors block"
              >
                <FolderOpen className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Categories</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{categoryCount}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">View all →</p>
              </Link>
            )}
            {isAdminUser() && (
              <Link
                href="/admin"
                data-tour="admin"
                className="w-full sm:w-[280px] bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-900/10 rounded-lg p-6 border border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 transition-colors block"
              >
                <Users className="w-8 h-8 text-amber-600 dark:text-amber-400 mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Add Employee</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{employeeCount}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Manage team →</p>
              </Link>
            )}
            <Link
              href="/profile"
              data-tour="profile"
              className="w-full sm:w-[280px] bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-900/10 rounded-lg p-6 border border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors block"
            >
              <User className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Profile</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">Account</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">View profile →</p>
            </Link>
          </div>

          {/* Placeholder Content */}
          <div
            className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 p-8"
            data-tour="getting-started"
          >
            <h2 className="text-2xl font-bold mb-4">Getting Started</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Your dashboard is ready! Here's what you can do:
            </p>
            <ul className="space-y-2 text-slate-600 dark:text-slate-400 mb-4">
              <li>• Upload and manage legal documents</li>
              <li>• Query your document knowledge base with AI</li>
              <li>• View compliance insights and analytics</li>
              <li>• Configure your organization settings</li>
            </ul>
            <button
              type="button"
              onClick={() => startupGuideRef.current?.startTour()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <Compass className="w-4 h-4" />
              Start tour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
