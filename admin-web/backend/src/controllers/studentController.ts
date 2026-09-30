import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  deleteStudentPhotoFromStorage,
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
  requireAdminScope,
} from "../utils/adminScope";
import { Student, StudentRowInput } from "../types/student";
import { assertNumberEditAllowed, withPendingFlags } from "../utils/recordStatus";

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

    await assertNumberEditAllowed(
      student.school_id,
      student.institute_id,
      req.body as Record<string, unknown>,
      student.photo_id
    );

    const optional = (key: string, alt?: string): string | null | undefined => {
      if (req.body[key] !== undefined) {
        const s = String(req.body[key]).trim();
        return s || null;
      }
      if (alt && req.body[alt] !== undefined) {
        const s = String(req.body[alt]).trim();
        return s || null;
      }
      return undefined;
    };

    const studentName =
      req.body.student_name !== undefined || req.body.studentName !== undefined
        ? String(req.body.student_name ?? req.body.studentName).trim()
        : student.student_name;
    const classSection =
      req.body.class_section !== undefined || req.body.classSection !== undefined
        ? String(req.body.class_section ?? req.body.classSection).trim()
        : student.class_section;

    const orgScope = student.school_id
      ? { schoolId: student.school_id }
      : { instituteId: student.institute_id ?? undefined };
    const formFields = await loadFormConfigForOrg(orgScope);

    const rollNo = optional("roll_no", "rollNo") ?? student.roll_no;
    const parentName = optional("parent_name", "parentName") ?? student.parent_name;
    const parentPhone = optional("parent_phone", "parentPhone") ?? student.parent_phone;
    const address = optional("address") ?? student.address;
    const dob = optional("dob") ?? student.dob;
    const gender = optional("gender") ?? student.gender;
    const bloodGroup = optional("blood_group", "bloodGroup") ?? student.blood_group;
    const custom1 = optional("custom_1", "custom1") ?? student.custom_1;
    const custom2 = optional("custom_2", "custom2") ?? student.custom_2;
    const custom3 = optional("custom_3", "custom3") ?? student.custom_3;

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
           updated_at = NOW()
       WHERE id = $14
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
    if (classFilter) {
      values.push(classFilter);
      conditions.push(`class_section = $${values.length}`);
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

    const studentResult = await pool.query<Student>(
      `SELECT ${STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);

    const orgId = student.school_id ?? student.institute_id;
    if (!orgId) throw new AppError("Student is not assigned to an organization", 400);

    if (student.photo_url && student.school_id) {
      await deleteStudentPhotoFromStorage(student.school_id, student.id);
    }

    const photoUrl = await uploadStudentPhotoToStorage(orgId, student.id, req.file);

    const updated = await pool.query<Student>(
      `UPDATE students
       SET photo_url = $1,
           status = 'captured',
           photo_captured_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING ${STUDENT_SELECT}`,
      [photoUrl, studentId]
    );

    res.status(200).json({ status: "ok", student: updated.rows[0] });
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

    const studentResult = await pool.query<{ student_name: string | null }>(
      `SELECT student_name FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);

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
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_school_excel",
      resourceId: schoolId,
      otp,
    });

    const students = await client.query<{ id: string; photo_url: string | null }>(
      `SELECT id, photo_url FROM students WHERE school_id = $1 FOR UPDATE`,
      [schoolId]
    );

    for (const row of students.rows) {
      if (row.photo_url) {
        await deleteStudentPhotoFromStorage(schoolId, row.id);
      }
    }

    await client.query(`DELETE FROM students WHERE school_id = $1`, [schoolId]);
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
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_institute_excel",
      resourceId: instituteId,
      otp,
    });

    const students = await client.query<{ id: string }>(
      `SELECT id FROM students WHERE institute_id = $1 FOR UPDATE`,
      [instituteId]
    );

    await client.query(`DELETE FROM students WHERE institute_id = $1`, [instituteId]);
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
    await client.query("BEGIN");

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_school_photos",
      resourceId: schoolId,
      otp,
    });

    const students = await client.query<{ id: string; photo_url: string | null }>(
      `SELECT id, photo_url FROM students WHERE school_id = $1 AND photo_url IS NOT NULL FOR UPDATE`,
      [schoolId]
    );

    for (const row of students.rows) {
      if (row.photo_url) {
        await deleteStudentPhotoFromStorage(schoolId, row.id);
      }
    }

    await client.query(
      `UPDATE students SET photo_url = NULL, status = 'pending', updated_at = NOW()
       WHERE school_id = $1 AND photo_url IS NOT NULL`,
      [schoolId]
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
       WHERE institute_id = $1 AND photo_url IS NOT NULL
       FOR UPDATE`,
      [instituteId]
    );

    for (const row of students.rows) {
      if (row.photo_url) {
        const storageId = row.school_id ?? instituteId;
        await deleteStudentPhotoFromStorage(storageId, row.id);
      }
    }

    await client.query(
      `UPDATE students SET photo_url = NULL, status = 'pending', updated_at = NOW()
       WHERE institute_id = $1 AND photo_url IS NOT NULL`,
      [instituteId]
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
