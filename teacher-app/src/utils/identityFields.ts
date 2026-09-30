export function isIdentityAliasLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized === "id" ||
    normalized === "photoid" ||
    normalized === "photonumber" ||
    normalized === "photono"
  );
}

export function isNameAliasLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized === "name" ||
    normalized === "studentname" ||
    normalized === "membername"
  );
}

/** Hide a second ID / PHOTO_ID row only when the values are the same identity. */
export function collapseSameIdentityFields<
  T extends { label: string; value: string; key?: string },
>(rows: T[]): T[] {
  const indexes: number[] = [];
  rows.forEach((row, index) => {
    if (isIdentityAliasLabel(row.label)) indexes.push(index);
  });
  if (indexes.length < 2) return rows;

  const values = indexes
    .map((index) => rows[index].value.trim())
    .filter((value) => value && value !== "-");
  const unique = new Set(values.map((value) => value.toLowerCase()));
  if (unique.size > 1) return rows;

  const nonempty = (index: number) => {
    const value = rows[index].value.trim();
    return Boolean(value && value !== "-");
  };
  const keep =
    indexes.find((index) => rows[index].key !== "photo_id" && nonempty(index)) ??
    indexes.find(nonempty) ??
    indexes[0];

  return rows.filter((row, index) => index === keep || !isIdentityAliasLabel(row.label));
}

/** Hide a second Name / Student Name row only when the values are the same. */
export function collapseSameNameFields<
  T extends { label: string; value: string; key?: string },
>(rows: T[]): T[] {
  const indexes: number[] = [];
  rows.forEach((row, index) => {
    if (isNameAliasLabel(row.label) || row.key === "student_name") indexes.push(index);
  });
  if (indexes.length < 2) return rows;

  const values = indexes
    .map((index) => rows[index].value.trim())
    .filter((value) => value && value !== "-");
  const unique = new Set(values.map((value) => value.toLowerCase()));
  if (unique.size > 1) return rows;

  const nonempty = (index: number) => {
    const value = rows[index].value.trim();
    return Boolean(value && value !== "-");
  };
  const keep = indexes.find(nonempty) ?? indexes[0];
  return rows.filter(
    (row, index) =>
      index === keep || !(isNameAliasLabel(row.label) || row.key === "student_name")
  );
}
