"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "@/app/theme-provider";
import {
  Gavel,
  LayoutDashboard,
  MessageSquare,
  Upload,
  FileText,
  Shield,
  Moon,
  Sun,
  LogOut,
  User,
} from "lucide-react";
import { getAuthTokenForApi, getRefreshToken, getApiBase, clearAuth, isAdminUser } from "@/app/utils/auth";

const navLinks: { href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/upload", label: "Upload", icon: Upload, adminOnly: true },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

export function AppNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  async function handleLogout() {
    const token = getAuthTokenForApi();
    const refresh = getRefreshToken();
    try {
      if (token) {
        await fetch(`${getApiBase()}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken: refresh ?? undefined }),
        });
      }
    } catch (err) {
      console.error(err);
    }
    clearAuth();
    await signOut({ redirect: false });
    if (typeof window !== "undefined") window.location.href = "/auth/login";
  }

  const showLinks = navLinks.filter((link) => !link.adminOnly || isAdminUser());

  return (
    <nav className="sticky top-0 z-50 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-900 dark:text-white hover:opacity-90 flex-shrink-0"
          >
            <Gavel className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span className="font-bold text-lg">Legal RAG</span>
          </Link>

          <div className="hidden md:flex items-center justify-center gap-1 flex-1">
            {showLinks.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href ||
                (href !== "/dashboard" && pathname.startsWith(href));

              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <Link
              href="/profile"
              className={`p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 ${
                pathname === "/profile" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-800"
              }`}
              aria-label="Profile"
            >
              <User className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-sm font-medium"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}