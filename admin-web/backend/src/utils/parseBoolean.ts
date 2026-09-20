/** Parse booleans from JSON, form fields, or query strings without treating "false" as true. */
export function parseBooleanField(
  value: unknown,
  defaultValue: boolean
): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return Boolean(value);
}

/** Organization is active unless explicitly set to false in the database. */
export function isOrganizationActive(
  isActive: boolean | null | undefined
): boolean {
  return isActive !== false;
}
