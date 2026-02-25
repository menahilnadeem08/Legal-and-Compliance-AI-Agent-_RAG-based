/**
 * Parse a timestamp from the API/DB as UTC so it displays correctly in the user's local time.
 * Server stores UTC; if the string has no timezone (e.g. "2026-02-25T01:55:22"), we treat it as UTC.
 */
export function parseAsUTC(isoOrDate: string): Date {
  const s = isoOrDate.trim();
  if (!s) return new Date();
  if (/Z$|[-+]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(s + (s.includes("T") ? "Z" : ""));
}
