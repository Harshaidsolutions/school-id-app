import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  DEFAULT_FORM_FIELDS,
  FormFieldConfig,
  inferFormFieldsFromColumnCounts,
  inferFormFieldsFromExcelHeaders,
  inferFormFieldsFromStudentRows,
  sortFormFields,
  withSequentialDisplayOrder,
} from "../constants/formFields";
import { isKnownFieldKey } from "../utils/excelSchema";
import {
  isExcelFormField,
  isManualFormField,
  withExcelSource,
  withManualSource,
  type FormFieldSource,
} from "../utils/formFieldSource";

export type { FormFieldConfig };
export { DEFAULT_FORM_FIELDS };

function normalizeSavedFields(raw: unknown): FormFieldConfig[] {
  if (typeof raw === "string") {
    try {
      return normalizeSavedFields(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const key = String(row.key ?? "").trim();
      const label = String(row.label ?? "").trim();
      if (!key || !label) return null;
      const colIndex =
        typeof row.colIndex === "number"
          ? row.colIndex
          : typeof row.col_index === "number"
            ? row.col_index
            : undefined;
      const displayOrder =
        typeof row.displayOrder === "number"
          ? row.displayOrder
          : typeof row.display_order === "number"
            ? row.display_order
            : undefined;
      const sourceRaw = String(row.source ?? "").trim().toLowerCase();
      const source: FormFieldSource | undefined =
        sourceRaw === "excel" || sourceRaw === "manual"
          ? (sourceRaw as FormFieldSource)
          : undefined;
      return {
        key,
        label,
        enabled: row.enabled === undefined ? true : Boolean(row.enabled),
        ...(colIndex !== undefined ? { colIndex } : {}),
        ...(displayOrder !== undefined ? { displayOrder } : {}),
        ...(source ? { source } : {}),
      };
    })
    .filter((f): f is FormFieldConfig => Boolean(f));
}

function isValidSavedFields(fields: unknown): fields is FormFieldConfig[] {
  const normalized = normalizeSavedFields(fields);
  return normalized.length > 0;
}

async function countOrgStudents(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<number> {
  const { schoolId, instituteId } = options;
  if (schoolId) {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM students WHERE school_id = $1::uuid`,
      [schoolId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
  if (instituteId) {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM students WHERE institute_id = $1::uuid`,
      [instituteId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
  return 0;
}

async function countImportBatchesForOrg(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<number> {
  const { schoolId, instituteId } = options;
  try {
    if (schoolId) {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM import_batches WHERE school_id = $1::uuid`,
        [schoolId]
      );
      return Number(result.rows[0]?.count ?? 0);
    }
    if (instituteId) {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM import_batches WHERE institute_id = $1::uuid`,
        [instituteId]
      );
      return Number(result.rows[0]?.count ?? 0);
    }
  } catch {
    return 0;
  }
  return 0;
}

async function orgHasImportedData(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<boolean> {
  const [students, batches] = await Promise.all([
    countOrgStudents(options),
    countImportBatchesForOrg(options),
  ]);
  return students > 0 || batches > 0;
}

async function loadStudentSampleRows(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<Array<Record<string, string | null>>> {
  const { schoolId, instituteId } = options;
  const result = await pool.query<Record<string, string | null>>(
    schoolId
      ? `SELECT photo_id, class_section, student_name, parent_name, parent_phone, address,
                roll_no, dob::text AS dob, gender, blood_group, custom_1, custom_2, custom_3,
                extra_fields
         FROM students WHERE school_id = $1::uuid LIMIT 200`
      : `SELECT photo_id, class_section, student_name, parent_name, parent_phone, address,
                roll_no, dob::text AS dob, gender, blood_group, custom_1, custom_2, custom_3,
                extra_fields
         FROM students WHERE institute_id = $1::uuid LIMIT 200`,
    [schoolId || instituteId]
  );
  return result.rows;
}

async function loadStudentColumnCounts(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<{ total: number; counts: Record<string, number> }> {
  const { schoolId, instituteId } = options;
  const result = await pool.query<Record<string, string>>(
    schoolId
      ? `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(photo_id, '')), '') IS NOT NULL)::text AS photo_id,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(class_section, '')), '') IS NOT NULL)::text AS class_section,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(student_name, '')), '') IS NOT NULL)::text AS student_name,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(parent_name, '')), '') IS NOT NULL)::text AS parent_name,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(parent_phone, '')), '') IS NOT NULL)::text AS parent_phone,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(address, '')), '') IS NOT NULL)::text AS address,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(roll_no, '')), '') IS NOT NULL)::text AS roll_no,
           COUNT(*) FILTER (WHERE dob IS NOT NULL)::text AS dob,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(gender, '')), '') IS NOT NULL)::text AS gender,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(blood_group, '')), '') IS NOT NULL)::text AS blood_group,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(custom_1, '')), '') IS NOT NULL)::text AS custom_1,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(custom_2, '')), '') IS NOT NULL)::text AS custom_2,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(custom_3, '')), '') IS NOT NULL)::text AS custom_3
         FROM students WHERE school_id = $1::uuid`
      : `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(photo_id, '')), '') IS NOT NULL)::text AS photo_id,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(class_section, '')), '') IS NOT NULL)::text AS class_section,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(student_name, '')), '') IS NOT NULL)::text AS student_name,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(parent_name, '')), '') IS NOT NULL)::text AS parent_name,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(parent_phone, '')), '') IS NOT NULL)::text AS parent_phone,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(address, '')), '') IS NOT NULL)::text AS address,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(roll_no, '')), '') IS NOT NULL)::text AS roll_no,
           COUNT(*) FILTER (WHERE dob IS NOT NULL)::text AS dob,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(gender, '')), '') IS NOT NULL)::text AS gender,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(blood_group, '')), '') IS NOT NULL)::text AS blood_group,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(custom_1, '')), '') IS NOT NULL)::text AS custom_1,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(custom_2, '')), '') IS NOT NULL)::text AS custom_2,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(custom_3, '')), '') IS NOT NULL)::text AS custom_3
         FROM students WHERE institute_id = $1::uuid`,
    [schoolId || instituteId]
  );

  const row = result.rows[0] ?? {};
  const total = Number(row.total ?? 0);
  const counts: Record<string, number> = {};
  for (const key of Object.keys(row)) {
    if (key === "total") continue;
    counts[key] = Number(row[key] ?? 0);
  }
  return { total, counts };
}

/** Excel columns + admin custom fields — preserve admin displayOrder from saved config. */
function mergeExcelSchemaWithSavedFields(
  saved: FormFieldConfig[],
  excelSchema: FormFieldConfig[]
): FormFieldConfig[] {
  if (excelSchema.length === 0) return sortFormFields(saved);

  const excelByKey = new Map(excelSchema.map((f) => [f.key, f]));
  const excelKeys = new Set(excelSchema.map((f) => f.key));
  const processedExcelKeys = new Set<string>();
  const savedOrdered = sortFormFields(saved);
  const merged: FormFieldConfig[] = [];

  for (const savedField of savedOrdered) {
    const labelKey = savedField.label.replace(/\s+/g, " ").trim().toUpperCase();
    let excelField =
      excelByKey.get(savedField.key) ??
      excelSchema.find(
        (e) => e.label.replace(/\s+/g, " ").trim().toUpperCase() === labelKey
      );

    if (excelField) {
      const colIndex = (excelField as { colIndex?: number }).colIndex;
      merged.push(
        withExcelSource({
          key: excelField.key,
          label: savedField.label.trim() || excelField.label,
          enabled: savedField.enabled ?? excelField.enabled,
          displayOrder: savedField.displayOrder,
          ...(typeof colIndex === "number" ? { colIndex } : {}),
        })
      );
      processedExcelKeys.add(excelField.key);
      continue;
    }

    if (
      isManualFormField(savedField) ||
      savedField.key.startsWith("dyn_") ||
      (!excelKeys.has(savedField.key) && !/^fld_\d+$/.test(savedField.key))
    ) {
      merged.push(withManualSource(savedField));
    } else if (/^fld_\d+$/.test(savedField.key)) {
      merged.push(withExcelSource(savedField));
      processedExcelKeys.add(savedField.key);
    }
  }

  let nextOrder =
    merged.length > 0
      ? Math.max(...merged.map((f) => f.displayOrder ?? 0), -1) + 1
      : 0;

  for (const excelField of excelSchema) {
    if (processedExcelKeys.has(excelField.key)) continue;
    const colIndex = (excelField as { colIndex?: number }).colIndex;
    merged.push(
      withExcelSource({
        key: excelField.key,
        label: excelField.label,
        enabled: excelField.enabled,
        displayOrder: nextOrder++,
        ...(typeof colIndex === "number" ? { colIndex } : {}),
      })
    );
  }

  return sortFormFields(merged);
}

function formFieldListsEqual(a: FormFieldConfig[], b: FormFieldConfig[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      field.key === other.key &&
      field.label === other.label &&
      field.enabled === other.enabled &&
      (field as { colIndex?: number }).colIndex ===
        (other as { colIndex?: number }).colIndex &&
      field.displayOrder === other.displayOrder &&
      field.source === other.source
    );
  });
}

async function loadExcelHeadersFromLatestBatch(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<string[]> {
  const schema = await loadExcelSchemaFromLatestBatch(options);
  if (schema.length > 0) {
    return schema.map((f) => f.label.trim()).filter(Boolean);
  }
  return [];
}

async function loadExcelSchemaFromLatestBatch(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId } = options;
  try {
    const result = await pool.query<{ excel_schema: unknown; excel_headers: unknown }>(
      schoolId
        ? `SELECT excel_schema, excel_headers
           FROM import_batches
           WHERE school_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT 1`
        : `SELECT excel_schema, excel_headers
           FROM import_batches
           WHERE institute_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT 1`,
      [schoolId || instituteId]
    );
    const row = result.rows[0];
    const fromSchema = normalizeSavedFields(row?.excel_schema);
    if (fromSchema.length > 0) {
      return fromSchema;
    }

    const rawHeaders = row?.excel_headers;
    if (!Array.isArray(rawHeaders)) return [];
    const headers = rawHeaders.map((h) => String(h).trim()).filter(Boolean);
    if (headers.length === 0) return [];
    return inferFormFieldsFromExcelHeaders(headers);
  } catch {
    return [];
  }
}

export async function clearFormConfigForOrg(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<void> {
  const { schoolId, instituteId } = options;
  if (schoolId) {
    await pool.query(`DELETE FROM form_configs WHERE school_id = $1::uuid`, [schoolId]);
    return;
  }
  if (instituteId) {
    await pool.query(`DELETE FROM form_configs WHERE institute_id = $1::uuid`, [instituteId]);
  }
}

export async function persistFormConfigFields(
  options: { schoolId?: string; instituteId?: string },
  fields: FormFieldConfig[]
): Promise<void> {
  const { schoolId, instituteId } = options;
  const payload = JSON.stringify(sortFormFields(fields));

  if (schoolId) {
    const updated = await pool.query(
      `UPDATE form_configs
       SET fields = $2::jsonb, updated_at = NOW()
       WHERE school_id = $1::uuid
       RETURNING id`,
      [schoolId, payload]
    );
    if ((updated.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO form_configs (school_id, institute_id, fields)
         VALUES ($1::uuid, NULL, $2::jsonb)`,
        [schoolId, payload]
      );
    }
    return;
  }

  if (instituteId) {
    const updated = await pool.query(
      `UPDATE form_configs
       SET fields = $2::jsonb, updated_at = NOW()
       WHERE institute_id = $1::uuid
       RETURNING id`,
      [instituteId, payload]
    );
    if ((updated.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO form_configs (school_id, institute_id, fields)
         VALUES (NULL, $1::uuid, $2::jsonb)`,
        [instituteId, payload]
      );
    }
  }
}

/** Build form field config from Excel headers and/or existing imported student columns. */
export async function backfillFormConfigForOrg(options: {
  schoolId?: string;
  instituteId?: string;
}): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId } = options;
  if (!schoolId && !instituteId) return [];

  const hasData = await orgHasImportedData({ schoolId, instituteId });
  if (!hasData) return [];

  let fields: FormFieldConfig[] = [];

  const excelSchema = await loadExcelSchemaFromLatestBatch({ schoolId, instituteId });
  if (excelSchema.length > 0) {
    fields = excelSchema;
  }

  if (fields.length === 0) {
    const { total, counts } = await loadStudentColumnCounts({ schoolId, instituteId });
    fields = inferFormFieldsFromColumnCounts(counts, total);
  }

  if (fields.length === 0) {
    const rows = await loadStudentSampleRows({ schoolId, instituteId });
    fields = inferFormFieldsFromStudentRows(rows);
  }

  try {
    await persistFormConfigFields({ schoolId, instituteId }, fields);
  } catch (error) {
    console.error("[form-config] persist failed during backfill:", error);
  }

  return sortFormFields(fields);
}

/** Ensure form config exists for orgs that already have imported students. */
export async function ensureFormConfigForOrg(options: {
  schoolId?: string;
  instituteId?: string;
  force?: boolean;
}): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId, force = false } = options;
  if (!schoolId && !instituteId) return [];

  if (force) {
    await clearFormConfigForOrg({ schoolId, instituteId });
    return backfillFormConfigForOrg({ schoolId, instituteId });
  }

  const existing = await pool.query<{ fields: unknown }>(
    schoolId
      ? `SELECT fields FROM form_configs WHERE school_id = $1::uuid LIMIT 1`
      : `SELECT fields FROM form_configs WHERE institute_id = $1::uuid LIMIT 1`,
    [schoolId || instituteId]
  );

  const saved = normalizeSavedFields(existing.rows[0]?.fields);
  if (saved.length > 0) {
    return sortFormFields(saved);
  }

  if (existing.rows[0]) {
    await clearFormConfigForOrg({ schoolId, instituteId });
  }

  return backfillFormConfigForOrg({ schoolId, instituteId });
}

/**
 * GET /admin/form-config?schoolId= | instituteId=&rebuild=true
 * Loads saved config, or auto-infers from existing Excel-imported students.
 */
export async function getFormConfig(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId =
      typeof req.query.schoolId === "string" ? req.query.schoolId.trim() : "";
    const instituteId =
      typeof req.query.instituteId === "string" ? req.query.instituteId.trim() : "";
    const rebuild = req.query.rebuild === "true";

    if (!schoolId && !instituteId) {
      throw new AppError("schoolId or instituteId is required", 400);
    }

    let fields = await ensureFormConfigForOrg({
      schoolId,
      instituteId,
      force: rebuild,
    });

    const studentCount = await countOrgStudents({ schoolId, instituteId });
    const importBatchCount = await countImportBatchesForOrg({ schoolId, instituteId });
    const excelSchema = await loadExcelSchemaFromLatestBatch({ schoolId, instituteId });

    if (fields.length === 0 && (studentCount > 0 || importBatchCount > 0)) {
      fields = await backfillFormConfigForOrg({ schoolId, instituteId });
    }

    if (excelSchema.length > 0) {
      const merged = mergeExcelSchemaWithSavedFields(fields, excelSchema);
      if (!formFieldListsEqual(merged, fields)) {
        fields = merged;
        await persistFormConfigFields({ schoolId, instituteId }, fields);
      } else {
        fields = merged;
      }
    }

    res.status(200).json({
      status: "ok",
      configured: fields.length > 0,
      studentCount,
      importBatchCount,
      fields: sortFormFields(fields),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /admin/form-config/sync
 * Body: { schoolId?, instituteId? } — force rebuild from existing imported data.
 */
export async function syncFormConfig(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = String(req.body.schoolId ?? "").trim() || "";
    const instituteId = String(req.body.instituteId ?? "").trim() || "";

    if (!schoolId && !instituteId) {
      throw new AppError("schoolId or instituteId is required", 400);
    }

    const fields = await ensureFormConfigForOrg({
      schoolId,
      instituteId,
      force: true,
    });

    res.status(200).json({
      status: "ok",
      configured: fields.length > 0,
      fields: sortFormFields(fields),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /admin/form-config
 * Body: { schoolId?, instituteId?, fields: FormFieldConfig[] }
 */
export async function putFormConfig(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = String(req.body.schoolId ?? "").trim() || null;
    const instituteId = String(req.body.instituteId ?? "").trim() || null;
    const fields = req.body.fields as FormFieldConfig[] | undefined;

    if (!schoolId && !instituteId) {
      throw new AppError("schoolId or instituteId is required", 400);
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new AppError("fields array is required", 400);
    }

    const existing = await ensureFormConfigForOrg({
      schoolId: schoolId ?? undefined,
      instituteId: instituteId ?? undefined,
    });

    let normalized = withSequentialDisplayOrder(
      fields
        .map((f) => {
          const colIndex = (f as { colIndex?: number }).colIndex;
          const displayOrder = (f as { displayOrder?: number }).displayOrder;
          const sourceRaw = String((f as { source?: string }).source ?? "").trim();
          const source: FormFieldSource | undefined =
            sourceRaw === "excel" || sourceRaw === "manual"
              ? (sourceRaw as FormFieldSource)
              : undefined;
          return {
            key: String(f.key ?? "").trim(),
            label: String(f.label ?? "").trim(),
            enabled: f.enabled !== false,
            ...(typeof colIndex === "number" ? { colIndex } : {}),
            ...(typeof displayOrder === "number" ? { displayOrder } : {}),
            ...(source ? { source } : {}),
          };
        })
        .filter((f) => f.key && f.label && isKnownFieldKey(f.key))
    );

    if (normalized.length === 0) {
      throw new AppError("At least one valid field is required", 400);
    }

    // Excel-derived fields cannot be deleted via Form Setup save.
    const normalizedKeys = new Set(normalized.map((f) => f.key));
    let nextOrder =
      normalized.length > 0
        ? Math.max(...normalized.map((f) => f.displayOrder ?? 0), -1) + 1
        : 0;
    for (const existingField of existing) {
      if (isExcelFormField(existingField) && !normalizedKeys.has(existingField.key)) {
        normalized.push({
          ...withExcelSource(existingField),
          displayOrder: nextOrder++,
        });
      }
    }

    normalized = sortFormFields(
      normalized.map((f) => {
        if (f.source === "excel" || f.source === "manual") return f;
        const hit = existing.find((e) => e.key === f.key);
        if (hit?.source === "excel" || hit?.source === "manual") {
          return { ...f, source: hit.source };
        }
        if (isExcelFormField(f)) return withExcelSource(f);
        if (f.key.startsWith("dyn_")) return withManualSource(f);
        return f;
      })
    );

    await persistFormConfigFields(
      { schoolId: schoolId ?? undefined, instituteId: instituteId ?? undefined },
      normalized
    );

    res.status(200).json({ status: "ok", configured: true, fields: sortFormFields(normalized) });
  } catch (error) {
    next(error);
  }
}

/** Load form config for export/import helpers. */
export async function loadFormConfigForOrg(options: {
  schoolId?: string | null;
  instituteId?: string | null;
}): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId } = options;
  if (!schoolId && !instituteId) return [];

  const fields = await ensureFormConfigForOrg({
    schoolId: schoolId ?? undefined,
    instituteId: instituteId ?? undefined,
  });
  if (fields.length > 0) return fields;

  const hasData = await orgHasImportedData({
    schoolId: schoolId ?? undefined,
    instituteId: instituteId ?? undefined,
  });
  if (hasData) {
    const rebuilt = await backfillFormConfigForOrg({
      schoolId: schoolId ?? undefined,
      instituteId: instituteId ?? undefined,
    });
    if (rebuilt.length > 0) return rebuilt;
  }

  return [];
}

/** After Excel upload, persist the parsed upload schema into form config. */
export async function syncFormConfigFromExcelFields(
  options: { schoolId?: string | null; instituteId?: string | null },
  fields: FormFieldConfig[]
): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId } = options;
  if (!schoolId && !instituteId) return [];

  if (fields.length === 0) {
    return backfillFormConfigForOrg({
      schoolId: schoolId ?? undefined,
      instituteId: instituteId ?? undefined,
    });
  }

  const existing = await ensureFormConfigForOrg({
    schoolId: schoolId ?? undefined,
    instituteId: instituteId ?? undefined,
  });
  const merged = mergeExcelSchemaWithSavedFields(existing, fields);

  await persistFormConfigFields(
    { schoolId: schoolId ?? undefined, instituteId: instituteId ?? undefined },
    merged
  );
  return sortFormFields(merged);
}

/** @deprecated Use syncFormConfigFromExcelFields with full schema from upload. */
export async function syncFormConfigFromExcelHeaders(
  options: { schoolId?: string | null; instituteId?: string | null },
  rawHeaders: string[]
): Promise<FormFieldConfig[]> {
  return syncFormConfigFromExcelFields(
    options,
    inferFormFieldsFromExcelHeaders(rawHeaders)
  );
}
