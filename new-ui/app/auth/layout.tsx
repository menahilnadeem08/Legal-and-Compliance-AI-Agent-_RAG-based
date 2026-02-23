import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal and Compliance Rag — Auth",
  description: "Sign in or create your Legal and Compliance Rag account",
};

/**
 * Auth layout — intentionally minimal.
 * Auth pages handle their own full-screen split layout,
 * so this wrapper just passes children through cleanly.
 * Add shared auth logic here (e.g. redirect if already authed) when you wire up real auth.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {children}
    </div>
  );
}