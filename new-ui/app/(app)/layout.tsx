/**
 * (app) Route Group Layout
 * Place this at: app/(app)/layout.tsx
 *
 * All protected/inner app pages go inside the (app) route group.
 * They'll inherit this consistent layout with nav + max-w-7xl container.
 * The route group folder name (app) won't appear in the URL.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Sparkles, LogOut, LayoutDashboard, Settings, Bell } from "lucide-react";
import { toast } from "sonner";
import { getAuthToken, clearAuth } from "@/app/utils/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Only redirect to login for protected routes; "/" is public (allow when pathname is "/" or not yet resolved)
    if (pathname != null && pathname !== "/" && !getAuthToken()) {
      router.replace("/auth/login");
    }
  }, [router, pathname]);

  const handleLogout = () => {
    clearAuth();
    toast.success("Signed out successfully");
    router.push("/auth/login");
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-blue-900 rounded-lg flex items-center justify-center group-hover:bg-blue-800 transition-colors">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold text-lg tracking-tight">Legal and Compliance Rag</span>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition-all text-sm font-medium"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition-all text-sm font-medium"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <button className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition-all">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-all text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p className="text-xs text-gray-600">© 2025 Legal and Compliance Rag Inc.</p>
          <p className="text-xs text-gray-600">
            Built with <span className="text-blue-800">♥</span>
          </p>
        </div>
      </footer>
    </div>
  );
}