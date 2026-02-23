"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  ArrowRight,
  Sparkles,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthToken } from "@/app/utils/auth";

const passwordRules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
];

function getStrengthLabel(score: number) {
  if (score === 0) return { label: "", color: "" };
  if (score === 1) return { label: "Weak", color: "text-red-400" };
  if (score === 2) return { label: "Fair", color: "text-amber-400" };
  return { label: "Strong", color: "text-emerald-400" };
}

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (getAuthToken()) router.replace("/dashboard");
  }, [router]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError("");
  };

  const passwordScore = passwordRules.filter((r) => r.test(form.password)).length;
  const strength = getStrengthLabel(passwordScore);
  const passwordsMatch = form.confirm.length > 0 && form.password === form.confirm;
  const confirmMismatch = form.confirm.length > 0 && form.password !== form.confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!form.email) {
      setError("Please enter your email address.");
      return;
    }
    if (passwordScore < 3) {
      setError("Please choose a stronger password.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    // 3-second mock loading
    await new Promise((res) => setTimeout(res, 3000));

    // Store registration info for OTP to use
    localStorage.setItem("registration-email", form.email);
    localStorage.setItem("registration-name", form.name);

    toast.success("Account created!", {
      description: "Check your email for the verification code.",
      duration: 4000,
    });

    // Navigate to OTP
    router.push("/auth/otp");
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* ── Left decorative panel ── */}
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
          <span className="text-blue-900 dark:text-white font-bold text-xl tracking-tight">Legal and Compliance Rag</span>
        </div>

        <div className="relative z-10">
          <h2 className="text-5xl font-bold text-blue-900 dark:text-white leading-tight mb-4">
            Start your
            <br />
            journey.
          </h2>
          <p className="text-blue-700 dark:text-blue-200 text-lg leading-relaxed max-w-sm">
            Create your account in seconds. No credit card required.
          </p>

          <div className="mt-8 space-y-3">
            {["Free 14-day trial", "No credit card needed", "Cancel anytime"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 border border-blue-300 dark:border-blue-600 flex items-center justify-center">
                  <Check className="w-3 h-3 text-blue-700 dark:text-blue-200" />
                </div>
                <span className="text-blue-800 dark:text-blue-100 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-blue-700 dark:text-blue-300 text-sm">
          © 2025 Legal and Compliance Rag Inc. All rights reserved.
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-slate-900 dark:text-white font-bold text-xl tracking-tight">Legal and Compliance Rag</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              Create account
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors underline-offset-2 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Error alert */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl px-4 py-3 animate-[fadeIn_0.2s_ease]">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 dark:text-red-300 text-sm flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError("")}
                  className="text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Full name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Full name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="John Doe"
                  autoComplete="name"
                  required
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-11 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:pointer-events-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar + label */}
              {form.password.length > 0 && (
                <div className="space-y-1.5 animate-[fadeIn_0.2s_ease]">
                  <div className="flex gap-1.5">
                    {passwordRules.map((rule, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                          rule.test(form.password) ? "bg-blue-500" : "bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${strength.color}`}>
                      {strength.label}
                    </span>
                    <div className="flex gap-3">
                      {passwordRules.map((rule, i) => (
                        <span
                          key={i}
                          className={`text-xs transition-colors ${
                            rule.test(form.password) ? "text-emerald-400" : "text-gray-600"
                          }`}
                        >
                          {rule.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={form.confirm}
                  onChange={set("confirm")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                  className={`w-full bg-white dark:bg-slate-900 border rounded-xl pl-10 pr-11 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-1 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    form.confirm.length === 0
                      ? "border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500"
                      : passwordsMatch
                      ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500"
                      : "border-red-500 focus:border-red-500 focus:ring-red-500"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  disabled={loading}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:pointer-events-none"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmMismatch && (
                <p className="text-xs text-red-400 flex items-center gap-1 animate-[fadeIn_0.2s_ease]">
                  <AlertCircle className="w-3 h-3" /> Passwords don't match
                </p>
              )}
              {passwordsMatch && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 animate-[fadeIn_0.2s_ease]">
                  <Check className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || confirmMismatch || form.confirm.length === 0}
              className="w-full bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              {loading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
              )}
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-800">
            <p className="text-center text-xs text-gray-600">
              By creating an account, you agree to our{" "}
              <span className="text-gray-500 hover:text-gray-400 cursor-pointer transition-colors">
                Terms
              </span>{" "}
              &{" "}
              <span className="text-gray-500 hover:text-gray-400 cursor-pointer transition-colors">
                Privacy Policy
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}