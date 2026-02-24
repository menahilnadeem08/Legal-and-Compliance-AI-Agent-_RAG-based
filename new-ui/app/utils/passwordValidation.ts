/**
 * Shared password validation rules and helpers.
 * Used by PasswordInput and form submit validation across the app.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "One uppercase letter (A–Z)",
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    id: "lowercase",
    label: "One lowercase letter (a–z)",
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "One number (0–9)",
    test: (value: string) => /[0-9]/.test(value),
  },
  {
    id: "special",
    label: "One special character (!@#$%^&* etc.)",
    test: (value: string) => /[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/.test(value),
  },
] as const;

/** Returns labels for rules that the password does not satisfy. */
export function getPasswordErrors(value: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value)).map((r) => r.label);
}

/** True if the password satisfies all rules. */
export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
