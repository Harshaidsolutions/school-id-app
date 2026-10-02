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

const ADD_PHOTO_ID = /^ADD_(\d+)$/i;

/**
 * Next manual Photo Number for this organization: ADD_000, ADD_001, ADD_002.
 * Existing numbers stay as they are. A deleted number is not issued again.
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

  const [org, existing] = await Promise.all([
    client.query<{ photo_capture_seq: number }>(
      `SELECT photo_capture_seq FROM ${table} WHERE id = $1::uuid`,
      [orgId]
    ),
    client.query<{ photo_id: string | null }>(
      `SELECT photo_id FROM students WHERE ${column} = $1`,
      [orgId]
    ),
  ]);

  let highest = -1;
  for (const row of existing.rows) {
    const match = ADD_PHOTO_ID.exec(String(row.photo_id ?? "").trim());
    if (!match) continue;
    const serial = Number(match[1]);
    if (Number.isFinite(serial)) highest = Math.max(highest, serial);
  }
  const current = org.rows[0]?.photo_capture_seq ?? 0;
  const issued = current === 0 && highest < 0 ? 0 : Math.max(current, highest) + 1;

  await client.query(
    `UPDATE ${table}
     SET photo_capture_seq = $2
     WHERE id = $1::uuid`,
    [orgId, issued]
  );

  return `ADD_${String(issued).padStart(3, "0")}`;
}
