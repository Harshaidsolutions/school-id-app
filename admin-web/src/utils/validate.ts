/**
 * Data checks used across the app (same rules as the website):
 * phone = 10-digit Indian mobile (optional +91 / 0 prefix), email = name@domain.tld.
 */
export function cleanPhone(value: string | null | undefined): string {
  let d = String(value ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export function isPhone(value: string | null | undefined): boolean {
  return /^[6-9]\d{9}$/.test(cleanPhone(value));
}

export function isEmail(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value ?? "").trim());
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A field that holds a phone number (Phone, Mobile, Parent phone, Contact no…). */
export function isPhoneField(key: string, label: string): boolean {
  const n = norm(label);
  return key === "parent_phone" || /phone|mobile|contactno|contactnumber|whatsapp|cellno/.test(n);
}

export function isEmailField(key: string, label: string): boolean {
  return /email|mail/.test(norm(label)) || key === "email";
}

/** Message for a wrong value, or null when the value is fine / empty. */
export function fieldProblem(key: string, label: string, value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  if (!v || v === "—") return null;
  if (isPhoneField(key, label) && !isPhone(v)) return `${label}: enter a valid 10-digit mobile number`;
  if (isEmailField(key, label) && !isEmail(v)) return `${label}: enter a valid email address`;
  return null;
}

export const phoneError = (v: string, required = false) =>
  !v.trim() ? (required ? "Phone number is required." : null) : isPhone(v) ? null : "Enter a valid 10-digit mobile number.";

export const emailError = (v: string, required = false) =>
  !v.trim() ? (required ? "Email is required." : null) : isEmail(v) ? null : "Enter a valid email address.";
