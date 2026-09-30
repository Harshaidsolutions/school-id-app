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

/**
 * One organization setting. Returns whether screenshots and recording are allowed.
 * Protection stays on when either stored flag is off, or when the client sends
 * screen_capture_protection = true.
 */
export function captureAllowedFromBody(body: {
  screen_capture_protection?: unknown;
  screenCaptureProtection?: unknown;
  allow_screenshot?: unknown;
  allowScreenshot?: unknown;
  allow_screen_recording?: unknown;
  allowScreenRecording?: unknown;
}): boolean {
  const protection = body.screen_capture_protection ?? body.screenCaptureProtection;
  if (protection !== undefined && protection !== null && String(protection) !== "") {
    return !parseBooleanField(protection, false);
  }
  const allowScreenshot = parseBooleanField(
    body.allow_screenshot ?? body.allowScreenshot,
    true
  );
  const allowRecording = parseBooleanField(
    body.allow_screen_recording ?? body.allowScreenRecording,
    true
  );
  return allowScreenshot && allowRecording;
}

/** Organization is active unless explicitly set to false in the database. */
export function isOrganizationActive(
  isActive: boolean | null | undefined
): boolean {
  return isActive !== false;
}
