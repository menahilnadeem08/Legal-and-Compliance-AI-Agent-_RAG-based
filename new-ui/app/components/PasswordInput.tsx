"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { PASSWORD_RULES } from "../utils/passwordValidation";

const defaultBorderClasses = "border-slate-300 dark:border-slate-600";
const errorBorderClasses = "border-red-500 dark:border-red-500";

export type PasswordInputVariant = "default" | "compact";

export interface PasswordInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  /** Show inline validation rules (use for new-password fields). */
  showValidation?: boolean;
  variant?: PasswordInputVariant;
  /** Optional className for the wrapper div (e.g. space-y-1.5). */
  className?: string;
  /** Optional: confirm password mode – show match/mismatch state; pass the "other" password to compare. */
  confirmValue?: string;
  required?: boolean;
}

export function PasswordInput({
  id,
  name,
  value,
  onChange,
  label,
  placeholder = "••••••••",
  autoComplete = "new-password",
  disabled = false,
  error,
  showValidation = false,
  variant = "default",
  className = "",
  confirmValue,
  required,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const isCompact = variant === "compact";
  const inputPadding = isCompact ? "pl-10 pr-10 py-2" : "pl-10 pr-11 py-3";
  const iconLeft = isCompact ? "left-3" : "left-3";
  const iconRight = isCompact ? "right-2.5" : "right-3";
  const rounded = isCompact ? "rounded-lg" : "rounded-xl";

  const hasError = Boolean(error);
  const borderClasses = hasError ? errorBorderClasses : defaultBorderClasses;

  const confirmMatch = confirmValue !== undefined && value.length > 0 && confirmValue.length > 0 && value === confirmValue;
  const confirmMismatch = confirmValue !== undefined && value.length > 0 && confirmValue.length > 0 && value !== confirmValue;
  const confirmBorder =
    confirmValue !== undefined && value.length > 0
      ? confirmMatch
        ? "border-emerald-500 dark:border-emerald-500"
        : confirmMismatch
          ? "border-red-500 dark:border-red-500"
          : defaultBorderClasses
      : borderClasses;

  const inputClassName = [
    "w-full bg-white dark:bg-slate-800 border text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all",
    inputPadding,
    rounded,
    hasError ? errorBorderClasses : confirmValue !== undefined ? confirmBorder : defaultBorderClasses,
  ].join(" ");

  return (
    <div className={className || "space-y-1.5"}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <Lock
          className={`absolute ${iconLeft} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none`}
        />
        <input
          id={id}
          name={name}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          className={inputClassName}
          aria-invalid={hasError ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : showValidation ? `${id}-rules` : undefined}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          disabled={disabled}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className={`absolute ${iconRight} top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:pointer-events-none`}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </p>
      )}
      {confirmValue !== undefined && value.length > 0 && (
        <>
          {confirmMismatch && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" /> Passwords don&apos;t match
            </p>
          )}
          {confirmMatch && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
              <Check className="w-3 h-3 flex-shrink-0" /> Passwords match
            </p>
          )}
        </>
      )}
      {showValidation && value.length > 0 && (
        <div id={`${id}-rules`} className="space-y-1 mt-1.5 animate-[fadeIn_0.2s_ease]">
          <ul className="space-y-1" aria-live="polite">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(value);
              return (
                <li
                  key={rule.id}
                  className={`text-xs flex items-center gap-2 ${met ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {met ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
