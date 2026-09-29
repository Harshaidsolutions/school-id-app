import type { PoolClient } from "pg";
import type { FormFieldConfig } from "../constants/formFields";
import { isIdentityAliasHeader, normalizeHeaderForMatch } from "./excelSchema";

const ADD_TOKEN = /ADD_(\d+)/gi;

export function isIdentityAliasLabel(label: string): boolean {
  return isIdentityAliasHeader(normalizeHeaderForMatch(label));
}

export function identityFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  return fields.filter((field) => field.enabled !== false && isIdentityAliasLabel(field.label));
}

export function firstIdentityValue(
  fields: FormFieldConfig[],
  extra: Record<string, string | null>
): string | null {
  for (const field of identityFields(fields)) {
    const value = extra[field.key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function collectAddNumbers(text: string, used: Set<number>): void {
  ADD_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ADD_TOKEN.exec(text))) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }
}

export function smallestAddSerial(texts: string[]): string {
  const used = new Set<number>();
  for (const text of texts) collectAddNumbers(text, used);
  let serial = 1;
  while (used.has(serial)) serial += 1;
  return `ADD_${String(serial).padStart(3, "0")}`;
}

/**
 * Smallest ADD_ serial that is not present on any student in this organization.
 * Deleted rows free their number. The org capture counter is raised to this
 * number so the photo-capture allocator cannot hand the same value out.
 */
export async function allocateReusableAddSerial(
  client: PoolClient,
  scope: { schoolId?: string | null; instituteId?: string | null }
): Promise<string> {
  const schoolId = scope.schoolId?.trim() || null;
  const instituteId = scope.instituteId?.trim() || null;
  const table = schoolId ? "schools" : "institutes";
  const column = schoolId ? "school_id" : "institute_id";
  const orgId = schoolId ?? instituteId;
  if (!orgId) {
    throw new Error("Organization is required to allocate an ID");
  }

  await client.query(`SELECT id FROM ${table} WHERE id = $1::uuid FOR UPDATE`, [orgId]);

  const existing = await client.query<{ photo_id: string | null; extra_fields: unknown }>(
    `SELECT photo_id, extra_fields FROM students WHERE ${column} = $1`,
    [orgId]
  );

  const texts: string[] = [];
  for (const row of existing.rows) {
    if (row.photo_id) texts.push(row.photo_id);
    if (row.extra_fields != null) texts.push(JSON.stringify(row.extra_fields));
  }
  const nextId = smallestAddSerial(texts);
  const serial = Number(nextId.slice(4));

  await client.query(
    `UPDATE ${table}
     SET photo_capture_seq = GREATEST(COALESCE(photo_capture_seq, 0), $2)
     WHERE id = $1::uuid`,
    [orgId, serial]
  );

  return nextId;
}
