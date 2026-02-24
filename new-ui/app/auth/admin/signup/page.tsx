"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  User,
  Mail,
  Building2,
  ArrowRight,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { setAuth, getAuthToken } from "../../../utils/auth";
import { api } from "../../../utils/apiClient";
import { mapFieldErrors } from "../../../utils/formErrors";
import { PasswordInput } from "../../../components/PasswordInput";
import { isPasswordValid } from "../../../utils/passwordValidation";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "signup" | "otp";

export default function AdminSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [otpValues, setOtpValues] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (getAuthToken()) router.replace("/");
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const u = username.trim();
    const em = email.trim();

    if (!u) {
      setError("Username is required.");
      return;
    }
    if (!em) {
      setError("Email is required.");
      return;
    }
    if (!EMAIL_REGEX.test(em)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (!isPasswordValid(password)) {
      setError("Password must be at least 8 characters with uppercase, lowercase, number, and special character.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setFieldErrors({});
    try {
      const response = await api.post<{ requiresVerification?: boolean; email?: string; emailSent?: boolean }>(
        "/auth/admin/signup",
        {
          username: u,
          email: em,
          password,
          confirmPassword,
          companyName: companyName.trim() || undefined,
        },
        { requiresAuth: false }
      );

      if (!response.success) {
        setError(response.message ?? "Signup failed");
        if (response.errors) setFieldErrors(mapFieldErrors(response.errors));
        return;
      }

      const data = response.data;
      if (data?.requiresVerification) {
        setVerifiedEmail(data.email ?? em);
        setStep("otp");
        setResendCooldown(data.emailSent === false ? 10 : 60);
        setSuccessMessage(response.message ?? "A verification code has been sent to your email.");
      }
    } catch (err) {
      setError("An error occurred during signup");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newValues = [...otpValues];
    newValues[index] = value.slice(-1);
    setOtpValues(newValues);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newValues = [...otpValues];
    for (let i = 0; i < 6; i++) newValues[i] = pasted[i] || "";
    setOtpValues(newValues);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpValues.join("");
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.post<{ accessToken?: string; refreshToken?: string; user?: object }>(
        "/auth/admin/verify-otp",
        { email: verifiedEmail, otp },
        { requiresAuth: false }
      );
      if (!response.success) {
        setError(response.message ?? "Verification failed");
        setOtpValues(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        return;
      }
      const data = response.data;
      if (data?.accessToken && data?.user) {
        setAuth(data.accessToken, data.user, data.refreshToken);
        router.push("/");
      } else {
        setError("Invalid response from server.");
      }
    } catch (err) {
      setError("An error occurred during verification");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const response = await api.post("/auth/admin/resend-otp", { email: verifiedEmail }, { requiresAuth: false });
      if (response.success) {
        setSuccessMessage(response.message ?? "A new verification code has been sent to your email.");
        setResendCooldown(60);
        setOtpValues(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
      } else {
        setError(response.message ?? "Failed to resend OTP");
      }
    } catch (err) {
      setError("Failed to resend verification code");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (step === "otp") {
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
              Verify your email
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              Enter the 6-digit code sent to <strong className="text-slate-700 dark:text-slate-300">{verifiedEmail}</strong>
            </p>
            {error && (
              <div className="flex items-start gap-2.5 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl px-4 py-3 mb-4">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            )}
            {successMessage && (
              <div className="flex items-start gap-2.5 bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/50 rounded-xl px-4 py-3 mb-4">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-emerald-700 dark:text-emerald-300 text-sm">{successMessage}</p>
              </div>
            )}
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otpValues.map((val, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={loading}
                    autoFocus={i === 0}
                    className="w-11 h-12 text-center text-lg font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-50"
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={loading || otpValues.join("").length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>Verify email <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
              <p className="text-center text-slate-600 dark:text-slate-400 text-sm">
                Didn&apos;t receive the code?{" "}
                {resendCooldown > 0 ? (
                  <span className="text-slate-500">Resend in {resendCooldown}s</span>
                ) : (
                  <button type="button" onClick={handleResendOtp} disabled={loading} className="text-blue-600 dark:text-blue-400 hover:underline font-medium disabled:opacity-50">
                    Resend code
                  </button>
                )}
              </p>
              <p className="text-center">
                <button type="button" onClick={() => { setStep("signup"); setError(""); setSuccessMessage(""); setOtpValues(["", "", "", "", "", ""]); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-sm">
                  Back to signup
                </button>
              </p>
            </form>
          </div>
        </div>
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
            Create admin account
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
            Already have an account?{" "}
            <Link
              href="/auth/admin/login"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Admin login
            </Link>
          </p>

          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            {error && (
              <div className="flex items-start gap-2.5 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  placeholder="admin_user"
                  autoComplete="username"
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            <PasswordInput
              id="password"
              value={password}
              onChange={(v) => { setPassword(v); setError(""); }}
              label="Password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={loading}
              required
              showValidation
              className=""
            />
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(v) => { setConfirmPassword(v); setError(""); }}
              label="Confirm password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={loading}
              required
              confirmValue={password}
              className=""
            />

            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Company name <span className="text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Sign up
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
