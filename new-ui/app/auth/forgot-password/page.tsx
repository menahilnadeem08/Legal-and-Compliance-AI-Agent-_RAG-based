"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/app/components/PasswordInput";
import { isPasswordValid } from "@/app/utils/passwordValidation";

type Step = "email" | "otp" | "reset" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    setError("");
    if (val && i < 5) {
      document.getElementById(`fp-otp-${i + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      document.getElementById(`fp-otp-${i - 1}`)?.focus();
    }
  };

  const passwordsMatch = confirm.length > 0 && password === confirm;
  const confirmMismatch = confirm.length > 0 && password !== confirm;

  const proceed = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (step === "email") {
      if (!email) { setError("Please enter your email address."); return; }
      setLoading(true);
      await new Promise((res) => setTimeout(res, 3000));
      setLoading(false);
      toast.success("Code sent!", {
        description: `A 6-digit code was sent to ${email}`,
      });
      setStep("otp");
      return;
    }

    if (step === "otp") {
      if (otp.some((d) => d === "")) {
        setError("Please enter all 6 digits.");
        return;
      }
      setLoading(true);
      await new Promise((res) => setTimeout(res, 3000));
      setLoading(false);
      // Mock: accept any 6-digit code
      toast.success("Code verified!", {
        description: "Now set your new password.",
      });
      setStep("reset");
      return;
    }

    if (step === "reset") {
      if (!isPasswordValid(password)) {
        setError("Please choose a stronger password (8+ chars, uppercase, lowercase, number, special character).");
        return;
      }
      if (!passwordsMatch) {
        setError("Passwords don't match.");
        return;
      }
      setLoading(true);
      await new Promise((res) => setTimeout(res, 3000));
      setLoading(false);
      setStep("done");
      toast.success("Password reset!", {
        description: "You can now sign in with your new password.",
        duration: 5000,
      });
    }
  };

  const handleResend = async () => {
    setOtp(["", "", "", "", "", ""]);
    setError("");
    toast.info("Code resent", {
      description: `A new code was sent to ${email}`,
    });
    document.getElementById("fp-otp-0")?.focus();
  };

  const stepTitles: Record<Step, { title: string; subtitle: string }> = {
    email: { title: "Forgot password?", subtitle: "Enter your email and we'll send you a 6-digit code." },
    otp: { title: "Check your email", subtitle: `We sent a verification code to ${email}` },
    reset: { title: "New password", subtitle: "Choose a strong password for your account." },
    done: { title: "All done!", subtitle: "Your password has been reset successfully." },
  };

  const steps: Step[] = ["email", "otp", "reset", "done"];
  const currentIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-blue-900 flex-col justify-between p-12">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-400 rounded-full blur-[140px] opacity-20" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500 rounded-full blur-[120px] opacity-20" />

        <div className="relative z-10 flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-900" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">Legal and Compliance Rag</span>
        </div>

        <div className="relative z-10">
          <h2 className="text-5xl font-bold text-white leading-tight mb-4">
            Secure
            <br />
            recovery.
          </h2>
          <p className="text-blue-200 text-lg leading-relaxed max-w-sm">
            Your password reset is protected with email verification.
          </p>
        </div>

        {/* Step progress indicator */}
        <div className="relative z-10 space-y-3">
          {steps.filter((s) => s !== "done").map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center border text-xs font-bold transition-all ${
                  currentIndex > i
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : currentIndex === i
                    ? "bg-blue-700 border-blue-400 text-white"
                    : "bg-transparent border-blue-700 text-blue-500"
                }`}
              >
                {currentIndex > i ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span
                className={`text-sm transition-colors ${
                  currentIndex >= i ? "text-blue-100" : "text-blue-600"
                }`}
              >
                {s === "email" ? "Enter email" : s === "otp" ? "Verify code" : "Reset password"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-blue-900 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">Legal and Compliance Rag</span>
          </div>

          {/* Back button */}
          {step !== "done" && (
            <button
              onClick={() => {
                if (step === "email") router.push("/auth/login");
                else if (step === "otp") setStep("email");
                else if (step === "reset") setStep("otp");
              }}
              disabled={loading}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-sm mb-8 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              {stepTitles[step].title}
            </h1>
            <p className="text-gray-400">{stepTitles[step].subtitle}</p>
          </div>

          {/* ── Done state ── */}
          {step === "done" ? (
            <div className="text-center py-8 animate-[fadeIn_0.4s_ease]">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-gray-400 mb-6">You can now sign in with your new password.</p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 px-6 rounded-xl transition-all group"
              >
                Go to sign in
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          ) : (
            <form onSubmit={proceed} className="space-y-5" noValidate>
              {/* Error alert */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 animate-[fadeIn_0.2s_ease]">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm flex-1">{error}</p>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="text-red-500 hover:text-red-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Step: Email */}
              {step === "email" && (
                <div className="space-y-1.5">
                  <label htmlFor="fp-email" className="text-sm font-medium text-gray-300">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    <input
                      id="fp-email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      disabled={loading}
                      autoFocus
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              {/* Step: OTP */}
              {step === "otp" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      Enter 6-digit code
                    </label>
                    <div className="flex gap-2.5">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          id={`fp-otp-${i}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          autoFocus={i === 0}
                          disabled={loading}
                          className={`w-full aspect-square text-center text-xl font-bold bg-slate-900 border rounded-xl text-white focus:outline-none focus:ring-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            digit
                              ? "border-blue-500 focus:ring-blue-500/30 bg-blue-950/30"
                              : "border-slate-700 focus:border-blue-500 focus:ring-blue-500/30"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">
                    Didn't receive it?{" "}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                    >
                      Resend code
                    </button>
                  </p>
                </div>
              )}

              {/* Step: Reset password */}
              {step === "reset" && (
                <>
                  <PasswordInput
                    id="fp-password"
                    value={password}
                    onChange={(v) => { setPassword(v); setError(""); }}
                    label="New password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                    showValidation
                    className="space-y-1.5"
                  />
                  <PasswordInput
                    id="fp-confirm"
                    value={confirm}
                    onChange={(v) => { setConfirm(v); setError(""); }}
                    label="Confirm new password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                    confirmValue={password}
                    className="space-y-1.5"
                  />
                </>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={
                  loading ||
                  (step === "reset" && (!passwordsMatch || !isPasswordValid(password)))
                }
                className="w-full bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
              >
                {loading && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
                )}
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>
                      {step === "email" && "Sending code..."}
                      {step === "otp" && "Verifying..."}
                      {step === "reset" && "Resetting password..."}
                    </span>
                  </>
                ) : (
                  <>
                    {step === "email" && "Send reset code"}
                    {step === "otp" && "Verify code"}
                    {step === "reset" && "Reset password"}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}