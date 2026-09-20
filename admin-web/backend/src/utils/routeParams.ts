/** Normalize Express route params to a single trimmed string. */
export function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}
