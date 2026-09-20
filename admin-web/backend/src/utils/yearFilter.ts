export function yearFilterClause(
  column: string,
  year: string
): { clause: string; values: unknown[] } {
  if (!year) return { clause: "", values: [] };
  return {
    clause: `WHERE ${column} = $1`,
    values: [year],
  };
}

export function defaultAcademicYear(): string {
  return String(new Date().getFullYear());
}
