import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  deleteStudentPhotoFromStorage,
  uploadMemberSignatureToStorage,
  uploadStudentPhotoToStorage,
} from "../config/storage";
import {
  parseStudentExcel,
  extractExcelHeaders,
  uniquenessKey,
  validateStudentRows,
  inferSchemaFromExcelBuffer,
} from "../utils/studentExcel";
import {
  requestAdminActionOtp,
  verifyAdminActionOtp,
} from "../utils/adminOtp";
import {
  bulkResourceId,
  parseBulkIds,
  requireAdminEmail,
} from "../utils/bulkIds";
import { syncFormConfigFromExcelFields } from "./formConfigController";
import {
  buildFieldLabelsFromConfig,
  mergeExtraFieldsForSave,
  parseExtraFields,
  rowToInsertParams,
} from "../utils/studentFieldAccess";
import { deriveCanonicalValuesFromExtraFields } from "../utils/excelSchema";
import {
  allocateReusableAddSerial,
  firstIdentityValue,
  identityFields,
} from "../utils/addSerial";
import { studentPhotoOrgId } from "../config/storage";
import { loadFormConfigForOrg } from "./formConfigController";
import { routeParam } from "../utils/routeParams";
import {
  assertInstituteOwnedByAdmin,
  assertSchoolOwnedByAdmin,
  assertStudentOwnedByAdmin,
  requireAdminScope,
} from "../utils/adminScope";
import { Student, StudentRowInput } from "../types/student";
import {
  assertNumberEditAllowed,
  collectRecordFacets,
  extraFieldValue,
  hasAllRequiredFieldData,
  loadRequiredDataContext,
  withPendingFlags,
} from "../utils/recordStatus";

function deleteFilterSql(
  body: Record<string, unknown> | undefined,
  startIndex: number
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const parts: string[] = [];
  const date = typeof body?.date === "string" ? body.date.trim() : "";
  const category = typeof body?.classSection === "string" ? body.classSection.trim() : "";
  const fieldKey = typeof body?.fieldKey === "string" ? body.fieldKey.trim() : "";
  const dataScope = typeof body?.dataScope === "string" ? body.dataScope.trim() : "";
  const photosOnly = body?.asset === "photos";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    values.push(date);
    const dateSql = photosOnly
      ? `(photo_captured_at AT TIME ZONE 'UTC')::date = $${startIndex + values.length - 1}::date`
      : `COALESCE((photo_captured_at AT TIME ZONE 'UTC')::date, (updated_at AT TIME ZONE 'UTC')::date) = $${startIndex + values.length - 1}::date`;
    parts.push(dateSql);
  }
  if (category && fieldKey && fieldKey !== "class_section" && /^[a-zA-Z0-9_]+$/.test(fieldKey)) {
    values.push(fieldKey, category);
    const keyParam = startIndex + values.length - 2;
    const valueParam = startIndex + values.length - 1;
    parts.push(
      `(btrim(COALESCE(extra_fields->>$${keyParam}, '')) = $${valueParam} OR (btrim(COALESCE(extra_fields->>$${keyParam}, '')) = '' AND btrim(COALESCE(class_section, '')) = $${valueParam}))`
    );
  } else if (category) {
    values.push(category);
    parts.push(`class_section = $${startIndex + values.length - 1}`);
  }
  if (dataScope === "captured") {
    parts.push(`photo_url IS NOT NULL AND btrim(photo_url) <> ''`);
  }
  if (dataScope === "uncaptured") {
    parts.push(`(photo_url IS NULL OR btrim(photo_url) = '')`);
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", values };
}

async function appendPendingDataIds(
  queryable: { query: typeof pool.query },
  orgColumn: "school_id" | "institute_id",
  orgId: string,
  filter: { sql: string; values: unknown[] },
  dataScope: string
): Promise<{ sql: string; values: unknown[] }> {
  if (dataScope !== "pending-data") return filter;
  const ctx = await loadRequiredDataContext(
    orgColumn === "school_id" ? orgId : null,
    orgColumn === "institute_id" ? orgId : null
  );
  const rows = await queryable.query<Student>(
    `SELECT ${STUDENT_SELECT} FROM students WHERE ${orgColumn} = $1${filter.sql}`,
    [orgId, ...filter.values]
  );
  const ids = rows.rows
    .filter(
      (row) =>
        !hasAllRequiredFieldData(
          row as unknown as Record<string, unknown>,
          ctx.fields,
          ctx.visibility,
          ctx.institute
        )
    )
    .map((row) => row.id);
  return {
    sql: `${filter.sql} AND id = ANY($${2 + filter.values.length}::uuid[])`,
    values: [...filter.values, ids],
  };
}

const STUDENT_SELECT = `
  id, school_id, institute_id, class_section, roll_no, student_name, parent_name, parent_phone,
  address, photo_id, photo_url, photo_captured_at, signature_url, status, import_batch_id, printed_at, created_at, updated_at,
  custom_1, custom_2, custom_3, dob, gender, blood_group, extra_fields, field_labels
`;

export async function bulkUploadStudents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();

  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const schoolId =
      typeof req.body?.schoolId === "string" ? req.body.schoolId.trim() : "";
    const instituteId =
      typeof req.body?.instituteId === "string" ? req.body.instituteId.trim() : "";
    const replaceExisting =
      req.body?.replaceExisting === true ||
      req.body?.replaceExisting === "true";

    if (!schoolId && !instituteId) {
      throw new AppError("schoolId or instituteId is required", 400);
    }
    if (schoolId && instituteId) {
      throw new AppError("Provide either schoolId or instituteId, not both", 400);
    }

    if (!req.file) {
      throw new AppError("Excel file is required (field name: file)", 400);
    }

    const orgScope = schoolId ? { schoolId } : { instituteId };

    let rows;
    let excelHeaders: string[] = [];
    let uploadSchema;
    try {
      excelHeaders = extractExcelHeaders(req.file.buffer);
      uploadSchema = inferSchemaFromExcelBuffer(req.file.buffer);
      // Always map from the uploaded sheet headers — never from saved form config keys.
      rows = parseStudentExcel(req.file.buffer);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Malformed Excel file: unable to parse", 400);
    }

    const errors = validateStudentRows(rows, uploadSchema);
    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        errors,
      });
      return;
    }

    const fieldLabels = buildFieldLabelsFromConfig(uploadSchema);
    const preparedRows = rows.map((row) => ({
      row,
      params: rowToInsertParams(row, { bulkImport: true }),
    }));
    console.info(
      "[bulk-upload] schema:",
      uploadSchema.map((f) => `${f.key}=${f.label}@${(f as { colIndex?: number }).colIndex ?? "?"}`).join(", "),
      `rows=${rows.length}`
    );

    await client.query("BEGIN");

    if (replaceExisting) {
      if (schoolId) {
        await client.query(`DELETE FROM students WHERE school_id = $1`, [schoolId]);
        await client.query(`DELETE FROM import_batches WHERE school_id = $1`, [schoolId]);
      } else {
        await client.query(`DELETE FROM students WHERE institute_id = $1`, [instituteId]);
        await client.query(`DELETE FROM import_batches WHERE institute_id = $1`, [instituteId]);
      }
      if (schoolId) {
        await client.query(`DELETE FROM form_configs WHERE school_id = $1::uuid`, [
          schoolId,
        ]);
      } else {
        await client.query(`DELETE FROM form_configs WHERE institute_id = $1::uuid`, [
          instituteId,
        ]);
      }
    }

    const existing = await client.query<{
      class_section: string;
      photo_id: string | null;
    }>(
      schoolId
        ? `SELECT class_section, photo_id FROM students WHERE school_id = $1`
        : `SELECT class_section, photo_id FROM students WHERE institute_id = $1`,
      [schoolId || instituteId]
    );

    const existingKeys = new Set(
      existing.rows
        .filter((r) => r.photo_id)
        .map((r) => uniquenessKey(r.class_section, r.photo_id as string))
    );

    const batchResult = await client.query<{ id: string }>(
      schoolId
        ? `INSERT INTO import_batches
             (school_id, file_name, total_rows, success_count, error_count, uploaded_by, excel_headers, excel_schema)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
           RETURNING id`
        : `INSERT INTO import_batches
             (institute_id, file_name, total_rows, success_count, error_count, uploaded_by, excel_headers, excel_schema)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
           RETURNING id`,
      [
        schoolId || instituteId,
        req.file.originalname,
        rows.length,
        rows.length,
        0,
        req.user.userId,
        JSON.stringify(excelHeaders),
        JSON.stringify(uploadSchema),
      ]
    );

    const importBatchId = batchResult.rows[0]?.id;
    if (!importBatchId) {
      throw new AppError("Failed to create import batch", 500);
    }

    let inserted = 0;
    let updated = 0;

    for (const { params } of preparedRows) {
      const key = uniquenessKey(params.classSection, params.photoId);

      if (!replaceExisting && existingKeys.has(key)) {
        await client.query(
          schoolId
            ? `UPDATE students
               SET student_name = $1, parent_name = $2, parent_phone = $3, address = $4,
                   roll_no = $5, dob = $6, gender = $7, blood_group = $8,
                   custom_1 = $9, custom_2 = $10, custom_3 = $11,
                   extra_fields = $12::jsonb, field_labels = $13::jsonb,
                   import_batch_id = $14, updated_at = NOW()
               WHERE school_id = $15 AND class_section = $16 AND photo_id = $17`
            : `UPDATE students
               SET student_name = $1, parent_name = $2, parent_phone = $3, address = $4,
                   roll_no = $5, dob = $6, gender = $7, blood_group = $8,
                   custom_1 = $9, custom_2 = $10, custom_3 = $11,
                   extra_fields = $12::jsonb, field_labels = $13::jsonb,
                   import_batch_id = $14, updated_at = NOW()
               WHERE institute_id = $15 AND class_section = $16 AND photo_id = $17`,
          [
            params.studentName,
            params.parentName,
            params.parentPhone,
            params.address,
            params.rollNo,
            params.dob,
            params.gender,
            params.bloodGroup,
            params.custom1,
            params.custom2,
            params.custom3,
            JSON.stringify(params.extraFields),
            JSON.stringify(fieldLabels),
            importBatchId,
            schoolId || instituteId,
            params.classSection,
            params.photoId,
          ]
        );
        updated += 1;
      } else {
        await client.query(
          schoolId
            ? `INSERT INTO students
                 (school_id, photo_id, class_section, student_name, parent_name, parent_phone,
                  address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
                  extra_fields, field_labels, import_batch_id, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, 'pending')`
            : `INSERT INTO students
                 (institute_id, photo_id, class_section, student_name, parent_name, parent_phone,
                  address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
                  extra_fields, field_labels, import_batch_id, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, 'pending')`,
          [
            schoolId || instituteId,
            params.photoId,
            params.classSection,
            params.studentName,
            params.parentName,
            params.parentPhone,
            params.address,
            params.rollNo,
            params.dob,
            params.gender,
            params.bloodGroup,
            params.custom1,
            params.custom2,
            params.custom3,
            JSON.stringify(params.extraFields),
            JSON.stringify(fieldLabels),
            importBatchId,
          ]
        );
        existingKeys.add(key);
        inserted += 1;
      }
    }

    await client.query("COMMIT");

    if (uploadSchema.length > 0) {
      await syncFormConfigFromExcelFields(orgScope, uploadSchema);
    }

    res.status(replaceExisting ? 200 : 201).json({
      success: true,
      replaced: replaceExisting,
      imported: inserted + updated,
      inserted,
      updated,
      importBatchId,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors if transaction was never started
    }
    if (error && typeof error === "object" && "code" in error) {
      const pg = error as { code?: string; message?: string };
      if (pg.code === "42703") {
        next(
          new AppError(
            "Database is missing dynamic field columns. Run: npm run migrate",
            500
          )
        );
        return;
      }
      if (pg.message) {
        console.error("[bulk-upload] database error:", pg.code, pg.message, error);
        next(new AppError(`Import failed: ${pg.message}`, 500));
        return;
      }
    }
    if (error instanceof Error) {
      console.error("[bulk-upload] failed:", error.message, error.stack);
    }
    next(error);
  } finally {
    client.release();
  }
}

/** POST /admin/students — manually add a student or institute member. */
export async function createStudentAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = String(req.body.schoolId ?? "").trim() || null;
    const instituteId = String(req.body.instituteId ?? "").trim() || null;
    if (!schoolId && !instituteId) {
      throw new AppError("schoolId or instituteId is required", 400);
    }
    if (schoolId && instituteId) {
      throw new AppError("Provide either schoolId or instituteId, not both", 400);
    }

    const orgScope = schoolId ? { schoolId } : { instituteId };
    const formFields = await loadFormConfigForOrg(orgScope);
    const fieldLabels = buildFieldLabelsFromConfig(formFields);

    const bodyVal = (key: string, alt?: string): string | null => {
      const raw =
        req.body[key] !== undefined
          ? req.body[key]
          : alt && req.body[alt] !== undefined
            ? req.body[alt]
            : undefined;
      if (raw === undefined || raw === null) return null;
      const s = String(raw).trim();
      return s || null;
    };

    const firstName = String(req.body.firstName ?? "").trim();
    const lastName = String(req.body.lastName ?? "").trim();

    const requestedPhotoId = bodyVal("photoId", "photo_id") ?? "";
    let photoId = requestedPhotoId;

    const extraFields = mergeExtraFieldsForSave(
      formFields,
      parseExtraFields(req.body.extra_fields),
      {
        photo_id: photoId,
        class_section: bodyVal("classSection", "class_section"),
        student_name:
          bodyVal("studentName", "student_name") ??
          ([firstName, lastName].filter(Boolean).join(" ").trim() || null),
        parent_name: bodyVal("parentName", "parent_name"),
        parent_phone: bodyVal("parentPhone", "parent_phone"),
        address: bodyVal("address"),
        roll_no: bodyVal("rollNo", "roll_no"),
        dob: bodyVal("dob"),
        gender: bodyVal("gender"),
        blood_group: bodyVal("bloodGroup", "blood_group"),
        custom_1: bodyVal("custom1", "custom_1"),
        custom_2: bodyVal("custom2", "custom_2"),
        custom_3: bodyVal("custom3", "custom_3"),
        ...Object.fromEntries(
          formFields
            .filter((f) => f.enabled && req.body[f.key] !== undefined)
            .map((f) => [f.key, bodyVal(f.key)])
        ),
      }
    );

    const schemaColumns = formFields
      .filter((f) => f.enabled)
      .map((f) => ({
        label: f.label,
        key: f.key,
        colIndex:
          typeof (f as { colIndex?: number }).colIndex === "number"
            ? (f as { colIndex: number }).colIndex
            : 0,
      }));

    const canonical = deriveCanonicalValuesFromExtraFields(
      schemaColumns,
      extraFields
    );

    const studentName =
      bodyVal("studentName", "student_name") ??
      canonical.student_name ??
      ([firstName, lastName].filter(Boolean).join(" ").trim() || null);
    if (!studentName) throw new AppError("Student name is required", 400);

    const classSection =
      bodyVal("classSection", "class_section") ??
      canonical.class_section ??
      (instituteId ? "ALL" : "");
    if (!classSection) {
      throw new AppError("Class / section is required", 400);
    }

    const rowInput: StudentRowInput = {
      excelRow: 0,
      photoId,
      classSection,
      studentName,
      parentName:
        bodyVal("parentName", "parent_name") ?? canonical.parent_name ?? "",
      parentPhone:
        bodyVal("parentPhone", "parent_phone") ??
        canonical.parent_phone ??
        "",
      address: bodyVal("address") ?? canonical.address ?? null,
      rollNo: bodyVal("rollNo", "roll_no") ?? canonical.roll_no ?? null,
      dob: null,
      gender: bodyVal("gender") ?? canonical.gender ?? null,
      bloodGroup: bodyVal("bloodGroup", "blood_group") ?? canonical.blood_group ?? null,
      custom1: null,
      custom2: null,
      custom3: null,
      extraFields,
    };

    const fromIdentity = firstIdentityValue(formFields, extraFields);
    const hasIdentityColumn = identityFields(formFields).length > 0;
    if (fromIdentity) photoId = fromIdentity;
    const allocateAddSerial = !photoId && !hasIdentityColumn;
    rowInput.photoId = photoId;

    const params = rowToInsertParams(rowInput, { bulkImport: true });
    let storedPhotoId: string | null = fromIdentity || requestedPhotoId || null;

    const insertSql = `INSERT INTO students
         (school_id, institute_id, photo_id, class_section, student_name, parent_name, parent_phone,
          address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
          extra_fields, field_labels, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, 'pending')
       RETURNING ${STUDENT_SELECT}`;
    const insertParams = () => [
        schoolId,
        instituteId,
        storedPhotoId,
        params.classSection,
        params.studentName,
        params.parentName,
        params.parentPhone,
        params.address,
        params.rollNo,
        params.dob,
        params.gender,
        params.bloodGroup,
        params.custom1,
        params.custom2,
        params.custom3,
        JSON.stringify(params.extraFields),
        JSON.stringify(fieldLabels),
      ];

    const result = allocateAddSerial
      ? await (async () => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            storedPhotoId = await allocateReusableAddSerial(client, {
              schoolId,
              instituteId,
            });
            const inserted = await client.query<Student>(insertSql, insertParams());
            await client.query("COMMIT");
            return inserted;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        })()
      : await pool.query<Student>(insertSql, insertParams());

    const student = result.rows[0];
    if (!student) throw new AppError("Failed to create student", 500);

    res.status(201).json({ status: "ok", student });
  } catch (error) {
    next(error);
  }
}

/** PUT /admin/students/:id */
export async function updateStudentAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Student id is required", 400);

    const existing = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [id]
    );
    const student = existing.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);

    await assertNumberEditAllowed(
      student.school_id,
      student.institute_id,
      req.body as Record<string, unknown>,
      student.photo_id
    );

    const textValue = (value: unknown): string | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const text = String(value).trim();
      return text || null;
    };
    const optional = (key: string, alt?: string): string | null | undefined => {
      if (req.body[key] !== undefined) return textValue(req.body[key]);
      if (alt && req.body[alt] !== undefined) return textValue(req.body[alt]);
      return undefined;
    };
    const optionalDate = (key: string): string | null | undefined => {
      const value = optional(key);
      if (value === undefined || value === null) return value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new AppError(`${key} must use YYYY-MM-DD`, 400);
      }
      return value;
    };

    const studentName =
      req.body.student_name !== undefined || req.body.studentName !== undefined
        ? textValue(req.body.student_name ?? req.body.studentName) || ""
        : student.student_name;
    if (!studentName.trim()) throw new AppError("Name is required", 400);
    const classSection =
      req.body.class_section !== undefined || req.body.classSection !== undefined
        ? textValue(req.body.class_section ?? req.body.classSection) || ""
        : student.class_section;
    if (!classSection.trim() && student.school_id) {
      throw new AppError("Class is required", 400);
    }

    const orgScope = student.school_id
      ? { schoolId: student.school_id }
      : { instituteId: student.institute_id ?? undefined };
    const formFields = await loadFormConfigForOrg(orgScope);

    const rollNo = optional("roll_no", "rollNo") ?? student.roll_no;
    const parentName = optional("parent_name", "parentName") ?? student.parent_name;
    const parentPhone = optional("parent_phone", "parentPhone") ?? student.parent_phone;
    const address = optional("address") ?? student.address;
    const dob = optionalDate("dob") ?? student.dob;
    const gender = optional("gender") ?? student.gender;
    const bloodGroup = optional("blood_group", "bloodGroup") ?? student.blood_group;
    const custom1 = optional("custom_1", "custom1") ?? student.custom_1;
    const custom2 = optional("custom_2", "custom2") ?? student.custom_2;
    const custom3 = optional("custom_3", "custom3") ?? student.custom_3;
    const photoIdProvided = req.body.photo_id !== undefined || req.body.photoId !== undefined;
    const photoId = photoIdProvided ? textValue(req.body.photo_id ?? req.body.photoId) ?? null : null;

    const extraFields = mergeExtraFieldsForSave(
      formFields,
      parseExtraFields(student.extra_fields),
      {
        student_name: studentName,
        class_section: classSection,
        roll_no: rollNo,
        parent_name: parentName,
        parent_phone: parentPhone,
        address,
        dob,
        gender,
        blood_group: bloodGroup,
        custom_1: custom1,
        custom_2: custom2,
        custom_3: custom3,
        ...parseExtraFields(req.body.extra_fields),
        ...Object.fromEntries(
          formFields
            .filter((f) => f.enabled && req.body[f.key] !== undefined)
            .map((f) => [f.key, optional(f.key) ?? null])
        ),
      }
    );

    const updated = await pool.query<Student>(
      `UPDATE students
       SET student_name = $1,
           class_section = $2,
           roll_no = COALESCE($3, roll_no),
           parent_name = COALESCE($4, parent_name),
           parent_phone = COALESCE($5, parent_phone),
           address = COALESCE($6, address),
           dob = COALESCE($7, dob),
           gender = COALESCE($8, gender),
           blood_group = COALESCE($9, blood_group),
           custom_1 = COALESCE($10, custom_1),
           custom_2 = COALESCE($11, custom_2),
           custom_3 = COALESCE($12, custom_3),
           extra_fields = $13::jsonb,
           photo_id = CASE WHEN $14::boolean THEN $15 ELSE photo_id END,
           updated_at = NOW()
       WHERE id = $16
       RETURNING ${STUDENT_SELECT}`,
      [
        studentName,
        classSection,
        rollNo,
        parentName,
        parentPhone,
        address,
        dob,
        gender,
        bloodGroup,
        custom1,
        custom2,
        custom3,
        JSON.stringify(extraFields),
        photoIdProvided,
        photoId,
        id,
      ]
    );

    res.status(200).json({ status: "ok", student: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function listStudentsBySchool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolIdRaw = req.params.schoolId;
    const schoolId =
      typeof schoolIdRaw === "string" ? schoolIdRaw.trim() : "";
    if (!schoolId) {
      throw new AppError("schoolId is required", 400);
    }

    const scope = await requireAdminScope(req);
    await assertSchoolOwnedByAdmin(scope, schoolId);

    const classFilter =
      typeof req.query.classSection === "string"
        ? req.query.classSection.trim()
        : typeof req.query.class === "string"
          ? req.query.class.trim()
          : "";
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status.trim() : "";

    const values: unknown[] = [schoolId];
    const conditions: string[] = [`school_id = $1`];

    if (classFilter) {
      values.push(classFilter);
      conditions.push(`class_section = $${values.length}`);
    }
    if (statusFilter) {
      values.push(statusFilter);
      conditions.push(`status = $${values.length}`);
    }

    const result = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT}
       FROM students
       WHERE ${conditions.join(" AND ")}
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      values
    );

    const students = await withPendingFlags(result.rows);
    res.status(200).json({
      status: "ok",
      count: students.length,
      students,
    });
  } catch (error) {
    next(error);
  }
}

/** Admin: list students across schools with optional filters */
export async function listStudentsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const schoolId =
      typeof req.query.schoolId === "string" ? req.query.schoolId.trim() : "";
    const instituteId =
      typeof req.query.instituteId === "string" ? req.query.instituteId.trim() : "";
    if (schoolId) await assertSchoolOwnedByAdmin(scope, schoolId);
    if (instituteId) await assertInstituteOwnedByAdmin(scope, instituteId);
    const classFilter =
      typeof req.query.classSection === "string"
        ? req.query.classSection.trim()
        : typeof req.query.class === "string"
          ? req.query.class.trim()
          : "";
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status.trim() : "";

    const values: unknown[] = [];
    const conditions: string[] = [];

    if (schoolId) {
      values.push(schoolId);
      conditions.push(`school_id = $${values.length}`);
    }
    if (instituteId) {
      values.push(instituteId);
      conditions.push(`institute_id = $${values.length}`);
    }
    if (!schoolId && !instituteId) {
      values.push(scope.adminUserId);
      const ownerParam = values.length;
      const schoolOwner = scope.isSuperAdmin
        ? `(s.owner_admin_id = $${ownerParam} OR s.owner_admin_id IS NULL)`
        : `s.owner_admin_id = $${ownerParam}`;
      const instituteOwner = scope.isSuperAdmin
        ? `(i.owner_admin_id = $${ownerParam} OR i.owner_admin_id IS NULL)`
        : `i.owner_admin_id = $${ownerParam}`;
      conditions.push(`(
        EXISTS (SELECT 1 FROM schools s WHERE s.id = students.school_id AND ${schoolOwner})
        OR EXISTS (SELECT 1 FROM institutes i WHERE i.id = students.institute_id AND ${instituteOwner})
      )`);
    }
    if (statusFilter) {
      values.push(statusFilter);
      conditions.push(`status = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT}
       FROM students
       ${where}
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      values
    );

    const photoFilter =
      typeof req.query.photo === "string" ? req.query.photo.trim() : "";
    const pendingDataFilter =
      typeof req.query.pendingData === "string" ? req.query.pendingData.trim() : "";
    const capturedOn =
      typeof req.query.capturedOn === "string" ? req.query.capturedOn.trim() : "";
    const category =
      typeof req.query.category === "string" ? req.query.category.trim() : "";
    const group = typeof req.query.group === "string" ? req.query.group.trim() : "";
    const designation =
      typeof req.query.designation === "string" ? req.query.designation.trim() : "";
    const flagged = await withPendingFlags(result.rows);
    const facets = collectRecordFacets(flagged);
    let students = flagged;
    if (photoFilter === "captured") {
      students = students.filter((row) => Boolean(row.photo_url?.trim()));
    } else if (photoFilter === "missing" || photoFilter === "uncaptured") {
      students = students.filter((row) => !row.photo_url?.trim());
    }
    if (pendingDataFilter === "yes") {
      students = students.filter((row) => row.pending_data);
    }
    if (pendingDataFilter === "no") {
      students = students.filter((row) => !row.pending_data);
    }
    if (classFilter) {
      students = students.filter((row) => (row.class_section ?? "") === classFilter);
    }
    if (category) {
      students = students.filter((row) => (row.class_section ?? "") === category);
    }
    if (group) {
      students = students.filter((row) => extraFieldValue(row, "group") === group);
    }
    if (designation) {
      students = students.filter((row) => extraFieldValue(row, "designation") === designation);
    }
    if (capturedOn) {
      students = students.filter((row) => {
        const raw = row.photo_captured_at;
        if (!raw) return false;
        return new Date(raw).toISOString().slice(0, 10) === capturedOn;
      });
    }
    res.status(200).json({
      status: "ok",
      count: students.length,
      students,
      facets,
    });
  } catch (error) {
    next(error);
  }
}

async function getAdminEmail(adminUserId: string): Promise<string> {
  const adminResult = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
    [adminUserId]
  );
  const email = adminResult.rows[0]?.email;
  if (!email) {
    throw new AppError("Admin account email is required to send OTP", 400);
  }
  return email;
}

/** POST /admin/students/:id/photo — upload or replace student photo */
export async function uploadStudentPhotoAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const studentId = routeParam(req.params.id);
    if (!studentId) throw new AppError("Student id is required", 400);
    if (!req.file) throw new AppError("Image file is required (field name: photo)", 400);

    const scope = await requireAdminScope(req);
    const studentResult = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(scope, student);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<Student>(
        `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 FOR UPDATE`,
        [studentId]
      );
      const current = locked.rows[0];
      if (!current) throw new AppError("Student not found", 404);
      await assertStudentOwnedByAdmin(scope, current);
      const orgId = current.school_id ?? current.institute_id;
      if (!orgId) throw new AppError("Student is not assigned to an organization", 400);

      const photoUrl = await uploadStudentPhotoToStorage(orgId, current.id, req.file);
      const updated = await client.query<Student>(
        `UPDATE students
         SET photo_url = $1,
             status = 'captured',
             photo_captured_at = NOW(),
             updated_at = NOW()
         WHERE id = $2
         RETURNING ${STUDENT_SELECT}`,
        [photoUrl, studentId]
      );
      await client.query("COMMIT");
      res.status(200).json({ status: "ok", student: updated.rows[0] });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

/** POST /admin/students/:id/signature — upload the member signature image */
export async function uploadStudentSignatureAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const studentId = routeParam(req.params.id);
    if (!studentId) throw new AppError("Student id is required", 400);
    if (!req.file) throw new AppError("Image file is required (field name: signature)", 400);

    const scope = await requireAdminScope(req);
    const studentResult = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(scope, student);
    const orgId = student.school_id ?? student.institute_id;
    if (!orgId) throw new AppError("Student is not assigned to an organization", 400);

    const formFields = await loadFormConfigForOrg({
      schoolId: student.school_id,
      instituteId: student.institute_id,
    });
    const signatureField = formFields.find((field) => field.key === "signature_upload");
    if (!signatureField?.enabled) {
      throw new AppError("Signature upload is turned off for this organization", 403);
    }

    const signatureUrl = await uploadMemberSignatureToStorage(orgId, student.id, req.file);
    const updated = await pool.query<Student>(
      `UPDATE students
       SET signature_url = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${STUDENT_SELECT}`,
      [signatureUrl, student.id]
    );
    const row = updated.rows[0];
    if (!row) throw new AppError("Failed to save signature", 500);
    res.status(200).json({ status: "ok", student: row });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/students/:id/photo — no OTP */
export async function deleteStudentPhotoAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const studentId = routeParam(req.params.id);
    if (!studentId) throw new AppError("Student id is required", 400);

    const studentResult = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);
    const photoOrgId = studentPhotoOrgId(student.school_id, student.institute_id);
    if (student.photo_url && photoOrgId) {
      await deleteStudentPhotoFromStorage(photoOrgId, student.id);
    }

    const updated = await pool.query<Student>(
      `UPDATE students
       SET photo_url = NULL, status = 'pending', updated_at = NOW()
       WHERE id = $1
       RETURNING ${STUDENT_SELECT}`,
      [studentId]
    );

    res.status(200).json({ status: "ok", student: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

/** POST /admin/students/:id/request-delete-otp */
export async function requestStudentDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const studentId = routeParam(req.params.id);
    if (!studentId) throw new AppError("Student id is required", 400);

    const studentResult = await pool.query<{
      student_name: string | null;
      school_id: string | null;
      institute_id: string | null;
    }>(
      `SELECT student_name, school_id, institute_id FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);

    const adminEmail = await getAdminEmail(req.user.userId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_student",
      resourceId: studentId,
      emailSubject: "Confirm student deletion",
      emailIntro: `Confirm deletion of student "${student.student_name ?? "record"}".`,
      logPrefix: "[student-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/students/:id — individual record delete (no OTP). */
export async function deleteStudentAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const studentId = routeParam(req.params.id);
    if (!studentId) throw new AppError("Student id is required", 400);

    await client.query("BEGIN");

    const studentResult = await client.query<Student>(
      `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);

    const photoOrgId = studentPhotoOrgId(student.school_id, student.institute_id);
    if (student.photo_url && photoOrgId) {
      await deleteStudentPhotoFromStorage(photoOrgId, student.id);
    }

    await client.query(`DELETE FROM students WHERE id = $1`, [studentId]);
    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: "Student deleted.",
      studentId,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}

/** POST /admin/schools/:schoolId/request-delete-excel-otp */
export async function requestSchoolExcelDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = routeParam(req.params.schoolId);
    if (!schoolId) throw new AppError("School id is required", 400);

    const schoolResult = await pool.query<{ name: string }>(
      `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    const school = schoolResult.rows[0];
    if (!school) throw new AppError("School not found", 404);

    const adminEmail = await getAdminEmail(req.user.userId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_school_excel",
      resourceId: schoolId,
      emailSubject: `Delete Excel data: ${school.name}`,
      emailIntro: `Confirm deletion of all Excel student data for "${school.name}".`,
      logPrefix: "[excel-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/schools/:schoolId/students — body: { otp } */
export async function deleteSchoolExcelData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = routeParam(req.params.schoolId);
    if (!schoolId) throw new AppError("School id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    const body = req.body as Record<string, unknown>;
    const filter = await appendPendingDataIds(
      client,
      "school_id",
      schoolId,
      deleteFilterSql(body, 2),
      typeof body.dataScope === "string" ? body.dataScope : ""
    );
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_school_excel",
      resourceId: schoolId,
      otp,
    });

    const students = await client.query<{ id: string; photo_url: string | null }>(
      `SELECT id, photo_url FROM students WHERE school_id = $1${filter.sql} FOR UPDATE`,
      [schoolId, ...filter.values]
    );

    for (const row of students.rows) {
      if (row.photo_url) {
        await deleteStudentPhotoFromStorage(schoolId, row.id);
      }
    }

    await client.query(
      `DELETE FROM students WHERE school_id = $1${filter.sql}`,
      [schoolId, ...filter.values]
    );
    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: "All student Excel data deleted for this school.",
      deletedCount: students.rows.length,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}

/** POST /admin/institutes/:instituteId/request-delete-excel-otp */
export async function requestInstituteExcelDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteId = routeParam(req.params.instituteId);
    if (!instituteId) throw new AppError("Institute id is required", 400);

    const instituteResult = await pool.query<{ name: string }>(
      `SELECT name FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    const institute = instituteResult.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);

    const adminEmail = await getAdminEmail(req.user.userId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_institute_excel",
      resourceId: instituteId,
      emailSubject: `Delete Excel data: ${institute.name}`,
      emailIntro: `Confirm deletion of all student data for "${institute.name}".`,
      logPrefix: "[institute-excel-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/institutes/:instituteId/students — body: { otp } */
export async function deleteInstituteExcelData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteId = routeParam(req.params.instituteId);
    if (!instituteId) throw new AppError("Institute id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    const body = req.body as Record<string, unknown>;
    const filter = await appendPendingDataIds(
      client,
      "institute_id",
      instituteId,
      deleteFilterSql(body, 2),
      typeof body.dataScope === "string" ? body.dataScope : ""
    );
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_institute_excel",
      resourceId: instituteId,
      otp,
    });

    const students = await client.query<{ id: string }>(
      `SELECT id FROM students WHERE institute_id = $1${filter.sql} FOR UPDATE`,
      [instituteId, ...filter.values]
    );

    await client.query(
      `DELETE FROM students WHERE institute_id = $1${filter.sql}`,
      [instituteId, ...filter.values]
    );
    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: "All student data deleted for this institute.",
      deletedCount: students.rows.length,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}

/** POST /admin/schools/:schoolId/request-delete-photos-otp */
export async function requestSchoolPhotosDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = routeParam(req.params.schoolId);
    if (!schoolId) throw new AppError("School id is required", 400);

    const schoolResult = await pool.query<{ name: string }>(
      `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    const school = schoolResult.rows[0];
    if (!school) throw new AppError("School not found", 404);

    const adminEmail = await getAdminEmail(req.user.userId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_school_photos",
      resourceId: schoolId,
      emailSubject: `Delete photos: ${school.name}`,
      emailIntro: `Confirm deletion of all captured student photos for "${school.name}". Student records will remain.`,
      logPrefix: "[photos-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/schools/:schoolId/photos — body: { otp } */
export async function deleteSchoolPhotosData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = routeParam(req.params.schoolId);
    if (!schoolId) throw new AppError("School id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    const filter = deleteFilterSql(req.body as Record<string, unknown>, 2);
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_school_photos",
      resourceId: schoolId,
      otp,
    });

    const students = await client.query<{ id: string; photo_url: string | null }>(
      `SELECT id, photo_url FROM students WHERE school_id = $1 AND photo_url IS NOT NULL${filter.sql} FOR UPDATE`,
      [schoolId, ...filter.values]
    );

    for (const row of students.rows) {
      if (row.photo_url) {
        await deleteStudentPhotoFromStorage(schoolId, row.id);
      }
    }

    await client.query(
      `UPDATE students SET photo_url = NULL, status = 'pending', updated_at = NOW()
       WHERE school_id = $1 AND photo_url IS NOT NULL${filter.sql}`,
      [schoolId, ...filter.values]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: "All student photos deleted for this school.",
      deletedCount: students.rows.length,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}

/** POST /admin/institutes/:instituteId/request-delete-photos-otp */
export async function requestInstitutePhotosDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteId = routeParam(req.params.instituteId);
    if (!instituteId) throw new AppError("Institute id is required", 400);

    const instituteResult = await pool.query<{ name: string }>(
      `SELECT name FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    const institute = instituteResult.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);

    const adminEmail = await getAdminEmail(req.user.userId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_institute_photos",
      resourceId: instituteId,
      emailSubject: `Delete photos: ${institute.name}`,
      emailIntro: `Confirm deletion of all captured member photos for "${institute.name}". Member records will remain.`,
      logPrefix: "[institute-photos-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/institutes/:instituteId/photos — body: { otp } */
export async function deleteInstitutePhotosData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteId = routeParam(req.params.instituteId);
    if (!instituteId) throw new AppError("Institute id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    const filter = deleteFilterSql(req.body as Record<string, unknown>, 2);
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_institute_photos",
      resourceId: instituteId,
      otp,
    });

    const students = await client.query<{
      id: string;
      photo_url: string | null;
      school_id: string | null;
    }>(
      `SELECT id, photo_url, school_id
       FROM students
       WHERE institute_id = $1 AND photo_url IS NOT NULL${filter.sql}
       FOR UPDATE`,
      [instituteId, ...filter.values]
    );

    for (const row of students.rows) {
      if (row.photo_url) {
        const storageId = row.school_id ?? instituteId;
        await deleteStudentPhotoFromStorage(storageId, row.id);
      }
    }

    await client.query(
      `UPDATE students SET photo_url = NULL, status = 'pending', updated_at = NOW()
       WHERE institute_id = $1 AND photo_url IS NOT NULL${filter.sql}`,
      [instituteId, ...filter.values]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: "All member photos deleted for this institute.",
      deletedCount: students.rows.length,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}

function orgScopeFromBody(body: {
  schoolId?: unknown;
  instituteId?: unknown;
}): { schoolId: string; instituteId: string } {
  const schoolId = String(body.schoolId ?? "").trim();
  const instituteId = String(body.instituteId ?? "").trim();
  if (Boolean(schoolId) === Boolean(instituteId)) {
    throw new AppError("Organization is required", 400);
  }
  return { schoolId, instituteId };
}

async function assertStudentsInOrg(
  scope: Awaited<ReturnType<typeof requireAdminScope>>,
  ids: string[],
  schoolId: string,
  instituteId: string
): Promise<void> {
  if (schoolId) await assertSchoolOwnedByAdmin(scope, schoolId);
  else await assertInstituteOwnedByAdmin(scope, instituteId);

  const found = await pool.query<{
    id: string;
    school_id: string | null;
    institute_id: string | null;
  }>(
    `SELECT id, school_id, institute_id FROM students WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  if (found.rows.length !== ids.length) {
    throw new AppError("One or more records were not found", 404);
  }
  for (const row of found.rows) {
    if (schoolId && row.school_id !== schoolId) {
      throw new AppError("Student not found", 404);
    }
    if (instituteId && row.institute_id !== instituteId) {
      throw new AppError("Member not found", 404);
    }
    await assertStudentOwnedByAdmin(scope, row);
  }
}

/** POST /admin/students/bulk-delete/request-otp */
export async function requestStudentBulkDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const ids = parseBulkIds(req.body?.ids, "record");
    const { schoolId, instituteId } = orgScopeFromBody(req.body ?? {});
    const scope = await requireAdminScope(req);
    await assertStudentsInOrg(scope, ids, schoolId, instituteId);
    const adminEmail = await requireAdminEmail(req.user.userId);
    const label = instituteId ? "member" : "student";
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_student_bulk",
      resourceId: bulkResourceId(ids),
      emailSubject: `Confirm ${label} deletion`,
      emailIntro: `Confirm deletion of ${ids.length} ${label}${ids.length === 1 ? "" : "s"}.`,
      logPrefix: "[student-bulk-delete]",
    });
    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** POST /admin/students/bulk-delete — body: { ids, otp, schoolId | instituteId } */
export async function bulkDeleteStudents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const ids = parseBulkIds(req.body?.ids, "record");
    const { schoolId, instituteId } = orgScopeFromBody(req.body ?? {});
    const scope = await requireAdminScope(req);
    await assertStudentsInOrg(scope, ids, schoolId, instituteId);
    const otp = String(req.body?.otp ?? "").trim();
    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_student_bulk",
      resourceId: bulkResourceId(ids),
      otp,
    });

    await client.query("BEGIN");
    const locked = await client.query<{
      id: string;
      school_id: string | null;
      institute_id: string | null;
      photo_url: string | null;
    }>(
      `SELECT id, school_id, institute_id, photo_url
       FROM students
       WHERE id = ANY($1::uuid[])
       FOR UPDATE`,
      [ids]
    );
    if (locked.rows.length !== ids.length) {
      throw new AppError("One or more records were not found", 404);
    }
    for (const row of locked.rows) {
      if (schoolId && row.school_id !== schoolId) {
        throw new AppError("Student not found", 404);
      }
      if (instituteId && row.institute_id !== instituteId) {
        throw new AppError("Member not found", 404);
      }
      await assertStudentOwnedByAdmin(scope, row);
      const photoOrgId = studentPhotoOrgId(row.school_id, row.institute_id);
      if (row.photo_url && photoOrgId) {
        await deleteStudentPhotoFromStorage(photoOrgId, row.id);
      }
    }
    const deleted = await client.query<{ id: string }>(
      `DELETE FROM students WHERE id = ANY($1::uuid[]) RETURNING id`,
      [ids]
    );
    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      deleted: deleted.rows.map((row) => row.id),
      deletedCount: deleted.rows.length,
      failedCount: 0,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}
