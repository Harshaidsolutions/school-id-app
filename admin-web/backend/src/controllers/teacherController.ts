import { assertPhotoNumberFree } from "../utils/photoNumber";
import { canonicalSyncFromExtra, classFieldKeys } from "../utils/studentFieldAccess";
import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  assertTeacherScope,
  getTeacherDataFilter,
  getTeacherSchoolId,
  isSchoolWideTeacher,
  resolveClassSectionQuery,
} from "../utils/teacherScope";
import {
  deleteStudentPhotoFromStorage,
  uploadMemberSignatureToStorage,
  uploadStudentFieldImageToStorage,
  uploadStudentPhotoToStorage,
} from "../config/storage";
import { loadFormConfigForOrg } from "./formConfigController";
import { withSignatureUploadField } from "../constants/formFields";
import { parseExtraFields } from "../utils/studentFieldAccess";
import {
  assertStudentBelongsToOrg,
  getTeacherOrgId,
  isInstituteStaff,
} from "../utils/teacherOrgScope";
import { studentPhotoOrgId } from "../config/storage";
import { loadOrgOwnerAdminId } from "../utils/adminScope";
import {
  allocateReusableAddSerial,
  firstIdentityValue,
  identityFields,
} from "../utils/addSerial";
import { persistCanonicalPhotoIds, withCanonicalPhotoId } from "../utils/photoIdentity";
import {
  assertRecordEditAllowed,
  requestedIdentityChange,
  hasAllRequiredFieldData,
  hasCapturedPhoto,
  loadRequiredDataContext,
  type RequiredDataContext,
} from "../utils/recordStatus";

async function insertTeacherStudent(
  sql: string,
  params: unknown[],
  allocate: { schoolId?: string; instituteId?: string } | null
) {
  if (!allocate) return pool.query(sql, params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    params[1] = await allocateReusableAddSerial(client, allocate);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function manualPhotoId(
  scope: { schoolId?: string; instituteId?: string },
  requested: string | null,
  extraFields: Record<string, string | null>
): Promise<{ photoId: string | null; allocate: boolean }> {
  const fields = await loadFormConfigForOrg({
    schoolId: scope.schoolId ?? null,
    instituteId: scope.instituteId ?? null,
  });
  const fromField = firstIdentityValue(fields, extraFields);
  if (fromField) {
    await assertPhotoNumberFree(scope, fromField);
    return { photoId: fromField, allocate: false };
  }
  if (requested) {
    await assertPhotoNumberFree(scope, requested);
    return { photoId: requested, allocate: false };
  }
  if (identityFields(fields).length > 0) return { photoId: null, allocate: false };
  return { photoId: null, allocate: true };
}

interface TeacherStudentRow {
  id: string;
  student_name: string;
  roll_no: string | null;
  app_visible?: boolean;
  photo_url: string | null;
  photo_captured_at: string | null;
  status: string | null;
  school_id: string | null;
  institute_id: string | null;
  class_section: string;
  parent_name: string | null;
  parent_phone: string | null;
  address: string | null;
  photo_id: string | null;
  signature_url: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  custom_1: string | null;
  custom_2: string | null;
  custom_3: string | null;
  extra_fields: Record<string, string | null> | null;
  field_labels: Record<string, string> | null;
  id_card_url: string | null;
  id_card_updated_at: string | null;
}

interface TeacherModelRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  image_url: string | null;
  video_url: string | null;
  extra_image_urls?: string[] | null;
  created_at: string | null;
}

const TEACHER_STUDENT_SELECT = `
  app_visible, id, student_name, roll_no, photo_url, photo_captured_at, signature_url, status, school_id, institute_id, class_section,
  parent_name, parent_phone, address, photo_id,
  dob, gender, blood_group, custom_1, custom_2, custom_3, extra_fields, field_labels,
  id_card_url, id_card_updated_at
`;

function nullableText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function optionalBodyString(
  body: Record<string, unknown>,
  keys: string[]
): string | null | undefined {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null) {
      return String(body[key]).trim() || null;
    }
  }
  return undefined;
}

function toStudentJson(row: TeacherStudentRow, ctx?: RequiredDataContext) {
  const unified = withCanonicalPhotoId(row);
  row = unified.row;
  const extraFields = parseExtraFields(row.extra_fields);
  const institute = Boolean(row.institute_id) && !row.school_id;
  const dataComplete = ctx
    ? hasAllRequiredFieldData(
        row as unknown as Record<string, unknown>,
        ctx.fields,
        ctx.visibility,
        institute
      )
    : Boolean(row.student_name?.trim()) &&
      (institute || Boolean(row.class_section?.trim()));
  // When the form collects a per-member signature, a missing signature means
  // the record is not fully captured yet (counts as pending).
  const signatureRequired = Boolean(
    ctx?.fields?.some(
      (f) => f.key === "signature_upload" && f.enabled !== false
    )
  );
  const signatureOk = !signatureRequired || Boolean(row.signature_url?.trim());
  const fieldLabels =
    row.field_labels && typeof row.field_labels === "object"
      ? row.field_labels
      : null;
  return {
    id: row.id,
    student_name: row.student_name,
    roll_no: row.roll_no,
    photo_url: row.photo_url,
    photo_captured_at: row.photo_captured_at,
    signature_url: row.signature_url,
    status: row.status,
    class_section: row.class_section,
    parent_name: row.parent_name,
    parent_phone: row.parent_phone,
    address: row.address,
    photo_id: row.photo_id,
    dob: row.dob,
    gender: row.gender,
    blood_group: row.blood_group,
    custom_1: row.custom_1,
    custom_2: row.custom_2,
    custom_3: row.custom_3,
    extra_fields: Object.keys(extraFields).length ? extraFields : null,
    field_labels: fieldLabels,
    id_card_url: row.id_card_url,
    id_card_updated_at: row.id_card_updated_at,
    pending_photo: !hasCapturedPhoto(row.photo_url),
    pending_data: !dataComplete || !signatureOk,
    fully_captured: hasCapturedPhoto(row.photo_url) && dataComplete && signatureOk,
  };
}

async function presentStudent(row: TeacherStudentRow) {
  const unified = withCanonicalPhotoId(row);
  if (unified.persist) {
    try {
      await persistCanonicalPhotoIds([unified.persist]);
    } catch {
      /* Response already shows the Excel photo number. */
    }
  }
  const ctx = await loadRequiredDataContext(row.school_id, row.institute_id);
  return toStudentJson(unified.row, ctx);
}

async function presentStudents(rows: TeacherStudentRow[]) {
  if (rows.length === 0) return [];
  const ctx = await loadRequiredDataContext(rows[0].school_id, rows[0].institute_id);
  const persist: { id: string; photoId: string }[] = [];
  const students = rows.map((row) => {
    const unified = withCanonicalPhotoId(row);
    if (unified.persist) persist.push(unified.persist);
    return toStudentJson(unified.row, ctx);
  });
  if (persist.length > 0) {
    try {
      await persistCanonicalPhotoIds(persist);
    } catch {
      /* Response already shows the Excel photo number. */
    }
  }
  return students;
}

export async function getTeacherFormConfig(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }
    const schoolId = req.user.schoolId ?? undefined;
    const instituteId = req.user.instituteId ?? undefined;
    const fields = withSignatureUploadField(
      await loadFormConfigForOrg({ schoolId, instituteId })
    );
    const version = await pool.query<{ updated_at: Date | null }>(
      `SELECT updated_at
       FROM form_configs
       WHERE ($1::uuid IS NOT NULL AND school_id = $1::uuid)
          OR ($2::uuid IS NOT NULL AND institute_id = $2::uuid)
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [schoolId ?? null, instituteId ?? null]
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({
      status: "ok",
      fields,
      updated_at: version.rows[0]?.updated_at ?? null,
    });
  } catch (error) {
    next(error);
  }
}

export async function listTeacherStudents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const groupValue =
      typeof req.query.groupValue === "string" ? req.query.groupValue : undefined;

    if (isInstituteStaff(req.user)) {
      const instituteId = getTeacherOrgId(req.user);
      const params: unknown[] = [instituteId];
      let filterSql = "";
      if (groupValue !== undefined) {
        const fields = await loadFormConfigForOrg({ instituteId });
        const gf = resolveGroupField(fields, "institute");
        params.push(gf.key);
        const expr = groupValueExpr(gf.column, params.length);
        if (groupValue.trim() === "") {
          filterSql = ` AND (${expr}) IS NULL`;
        } else {
          params.push(groupValue);
          filterSql = ` AND (${expr}) = $${params.length}`;
        }
      }
      const result = await pool.query<TeacherStudentRow>(
        `SELECT ${TEACHER_STUDENT_SELECT}
         FROM students
         WHERE app_visible = true AND institute_id = $1${filterSql}
         ORDER BY student_name ASC, roll_no ASC NULLS LAST`,
        params
      );
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json({
        status: "ok",
        count: result.rows.length,
        students: await presentStudents(result.rows),
      });
      return;
    }

    const queryClassSection = resolveClassSectionQuery(
      req.query as Record<string, unknown>
    );

    let schoolId: string;
    let scopedClass: string | null = null;
    if (isSchoolWideTeacher(req.user)) {
      schoolId = getTeacherSchoolId(req.user);
    } else {
      const filter = getTeacherDataFilter(req.user);
      schoolId = filter.schoolId;
      scopedClass = filter.classSection;
    }

    const params: unknown[] = [schoolId];
    let filterSql = "";
    if (scopedClass) {
      params.push(scopedClass);
      filterSql += ` AND class_section = $${params.length}`;
      assertTeacherScope(req.user, { schoolId, classSection: scopedClass });
    }
    if (groupValue !== undefined) {
      const fields = await loadFormConfigForOrg({ schoolId });
      const gf = resolveGroupField(fields, "school");
      params.push(gf.key);
      const expr = groupValueExpr(gf.column, params.length);
      if (groupValue.trim() === "") {
        filterSql += ` AND (${expr}) IS NULL`;
      } else {
        params.push(groupValue);
        filterSql += ` AND (${expr}) = $${params.length}`;
      }
    } else if (queryClassSection) {
      params.push(queryClassSection);
      filterSql += ` AND class_section = $${params.length}`;
    }

    const result = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT}
       FROM students
       WHERE app_visible = true AND school_id = $1${filterSql}
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      params
    );

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      students: await presentStudents(result.rows),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /teacher/students/:id — one record scoped to the signed-in organization. */
export async function getTeacherStudent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const studentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!studentId) throw new AppError("Student id is required", 400);

    const studentResult = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    assertStudentBelongsToOrg(req.user, student);
    if (!isInstituteStaff(req.user)) {
      assertTeacherScope(req.user, {
        schoolId: student.school_id!,
        classSection: student.class_section,
      });
    }
    const [presented] = await presentStudents([student]);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({ status: "ok", student: presented });
  } catch (error) {
    next(error);
  }
}

export async function createTeacherStudent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const studentName = String(
      req.body.student_name ?? req.body.studentName ?? req.body.name ?? ""
    ).trim();
    if (!studentName) {
      throw new AppError("Name is required", 400);
    }

    let classSection = resolveClassSectionQuery(
      req.body as Record<string, unknown>
    );
    if (!classSection && req.body.class_section !== undefined) {
      classSection = String(req.body.class_section).trim();
    }

    if (isInstituteStaff(req.user)) {
      const instituteId = getTeacherOrgId(req.user);
      if (!classSection) classSection = "ALL";

      const rollNoRaw = req.body.roll_no ?? req.body.rollNo;
      const rollNo =
        rollNoRaw !== undefined && rollNoRaw !== null && String(rollNoRaw).trim()
          ? String(rollNoRaw).trim()
          : null;
      const parentNameRaw = req.body.parent_name ?? req.body.parentName;
      const parentName =
        parentNameRaw !== undefined &&
        parentNameRaw !== null &&
        String(parentNameRaw).trim()
          ? String(parentNameRaw).trim()
          : null;
      const parentPhoneRaw = req.body.parent_phone ?? req.body.parentPhone;
      const parentPhone =
        parentPhoneRaw !== undefined &&
        parentPhoneRaw !== null &&
        String(parentPhoneRaw).trim()
          ? String(parentPhoneRaw).trim()
          : null;
      const addressRaw = req.body.address;
      const address =
        addressRaw !== undefined &&
        addressRaw !== null &&
        String(addressRaw).trim()
          ? String(addressRaw).trim()
          : null;

      const body = req.body as Record<string, unknown>;
      const dob = optionalBodyString(body, ["dob"]) ?? null;
      const gender = optionalBodyString(body, ["gender"]) ?? null;
      const bloodGroup =
        optionalBodyString(body, ["blood_group", "bloodGroup"]) ?? null;
      const custom1 =
        optionalBodyString(body, ["custom_1", "custom1"]) ?? null;
      const custom2 =
        optionalBodyString(body, ["custom_2", "custom2"]) ?? null;
      const custom3 =
        optionalBodyString(body, ["custom_3", "custom3"]) ?? null;

      const photoIdRaw = String(
        req.body.photo_id ?? req.body.photoId ?? ""
      ).trim();

      const extraFields = parseExtraFields(
        req.body.extra_fields ?? req.body.extraFields
      );
      const resolvedPhoto = await manualPhotoId(
        { instituteId },
        photoIdRaw || null,
        extraFields
      );

      const result = await insertTeacherStudent(
        `INSERT INTO students
           (institute_id, photo_id, class_section, student_name, parent_name, parent_phone,
            address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
            extra_fields, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, 'pending')
         RETURNING ${TEACHER_STUDENT_SELECT}`,
        [
          instituteId,
          resolvedPhoto.photoId,
          classSection,
          studentName,
          parentName,
          parentPhone,
          address,
          rollNo,
          dob,
          gender,
          bloodGroup,
          custom1,
          custom2,
          custom3,
          JSON.stringify(extraFields),
        ],
        resolvedPhoto.allocate ? { instituteId } : null
      );

      const student = result.rows[0];
      if (!student) {
        throw new AppError("Failed to create member", 500);
      }

      res.status(201).json({
        status: "ok",
        student: await presentStudent(student),
      });
      return;
    }

    if (!classSection) {
      throw new AppError("Class / section is required", 400);
    }

    const schoolId = getTeacherSchoolId(req.user);
    assertTeacherScope(req.user, { schoolId, classSection });

    const rollNoRaw = req.body.roll_no ?? req.body.rollNo;
    const rollNo =
      rollNoRaw !== undefined && rollNoRaw !== null && String(rollNoRaw).trim()
        ? String(rollNoRaw).trim()
        : null;
    const parentNameRaw = req.body.parent_name ?? req.body.parentName;
    const parentName =
      parentNameRaw !== undefined &&
      parentNameRaw !== null &&
      String(parentNameRaw).trim()
        ? String(parentNameRaw).trim()
        : null;
    const parentPhoneRaw = req.body.parent_phone ?? req.body.parentPhone;
    const parentPhone =
      parentPhoneRaw !== undefined &&
      parentPhoneRaw !== null &&
      String(parentPhoneRaw).trim()
        ? String(parentPhoneRaw).trim()
        : null;
    const addressRaw = req.body.address;
    const address =
      addressRaw !== undefined &&
      addressRaw !== null &&
      String(addressRaw).trim()
        ? String(addressRaw).trim()
        : null;

    const body = req.body as Record<string, unknown>;
    const dob = optionalBodyString(body, ["dob"]) ?? null;
    const gender = optionalBodyString(body, ["gender"]) ?? null;
    const bloodGroup =
      optionalBodyString(body, ["blood_group", "bloodGroup"]) ?? null;
    const custom1 =
      optionalBodyString(body, ["custom_1", "custom1"]) ?? null;
    const custom2 =
      optionalBodyString(body, ["custom_2", "custom2"]) ?? null;
    const custom3 =
      optionalBodyString(body, ["custom_3", "custom3"]) ?? null;

    const extraFields = parseExtraFields(req.body.extra_fields ?? req.body.extraFields);
    const resolvedPhoto = await manualPhotoId(
      { schoolId },
      String(req.body.photo_id ?? req.body.photoId ?? "").trim() || null,
      extraFields
    );

    const result = await insertTeacherStudent(
      `INSERT INTO students
         (school_id, photo_id, class_section, student_name, parent_name, parent_phone,
          address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
          extra_fields, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, 'pending')
       RETURNING ${TEACHER_STUDENT_SELECT}`,
      [
        schoolId,
        resolvedPhoto.photoId,
        classSection,
        studentName,
        parentName,
        parentPhone,
        address,
        rollNo,
        dob,
        gender,
        bloodGroup,
        custom1,
        custom2,
        custom3,
        JSON.stringify(extraFields),
      ],
      resolvedPhoto.allocate ? { schoolId } : null
    );

    const student = result.rows[0];
    if (!student) {
      throw new AppError("Failed to create student", 500);
    }

    res.status(201).json({
      status: "ok",
      student: await presentStudent(student),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadStudentPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const studentId = req.params.id;
    if (!studentId) {
      throw new AppError("Student id is required", 400);
    }

    if (!req.file) {
      throw new AppError("Image file is required (field name: photo)", 400);
    }

    const studentResult = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT}
       FROM students
       WHERE id = $1
       LIMIT 1`,
      [studentId]
    );

    const student = studentResult.rows[0];
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    assertStudentBelongsToOrg(req.user, student);

    const orgId = studentPhotoOrgId(student.school_id, student.institute_id);
    if (!orgId) {
      throw new AppError("Student is not assigned to an organization", 400);
    }

    if (!isInstituteStaff(req.user)) {
      assertTeacherScope(req.user, {
        schoolId: student.school_id!,
        classSection: student.class_section,
      });
    }

    const photoUrl = await uploadStudentPhotoToStorage(orgId, student.id, req.file);

    const client = await pool.connect();
    let updatedStudent: TeacherStudentRow | undefined;
    try {
      await client.query("BEGIN");
      const locked = await client.query<TeacherStudentRow>(
        `SELECT ${TEACHER_STUDENT_SELECT} FROM students WHERE id = $1 FOR UPDATE`,
        [student.id]
      );
      const current = locked.rows[0];
      if (!current) throw new AppError("Student not found", 404);
      assertStudentBelongsToOrg(req.user, current);
      if (!isInstituteStaff(req.user)) {
        assertTeacherScope(req.user, {
          schoolId: current.school_id!,
          classSection: current.class_section,
        });
      }

      const updated = await client.query<TeacherStudentRow>(
        `UPDATE students
         SET photo_url = $1,
             status = 'captured',
             photo_captured_at = COALESCE(photo_captured_at, NOW()),
             photo_cropped = false,
             updated_at = NOW()
         WHERE id = $2
         RETURNING ${TEACHER_STUDENT_SELECT}`,
        [photoUrl, current.id]
      );

      updatedStudent = updated.rows[0];
      if (!updatedStudent) {
        throw new AppError("Failed to update student photo", 500);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.status(200).json({
      status: "ok",
      student: await presentStudent(updatedStudent),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /teacher/students/:id/signature — optional student or member signature.
 */
export async function uploadMemberSignature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const studentId = req.params.id;
    if (!studentId) throw new AppError("Member id is required", 400);
    if (!req.file) {
      throw new AppError("Image file is required (field name: signature)", 400);
    }

    const studentResult = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Member not found", 404);
    assertStudentBelongsToOrg(req.user, student);
    const orgId = student.institute_id ?? student.school_id;
    if (!orgId) {
      throw new AppError("Student is not assigned to an organization", 400);
    }

    const formFields = await loadFormConfigForOrg({
      schoolId: student.school_id,
      instituteId: student.institute_id,
    });
    const signatureField = formFields.find((field) => field.key === "signature_upload");
    if (!signatureField?.enabled) {
      throw new AppError("Signature upload is turned off for this organization", 403);
    }

    const signatureUrl = await uploadMemberSignatureToStorage(
      orgId,
      student.id,
      req.file
    );
    const updated = await pool.query<TeacherStudentRow>(
      `UPDATE students
       SET signature_url = $1, signature_cropped = false, updated_at = NOW()
       WHERE id = $2 AND (school_id = $3 OR institute_id = $3)
       RETURNING ${TEACHER_STUDENT_SELECT}`,
      [signatureUrl, student.id, orgId]
    );
    const row = updated.rows[0];
    if (!row) throw new AppError("Failed to save signature", 500);
    res.status(200).json({ status: "ok", student: await presentStudent(row) });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /teacher/students/:id/field-image — upload an image for an arbitrary
 * form field the admin set to "Image/Photo" type. Stored as a URL in
 * extra_fields[key] (merge-safe: never wipes other fields).
 */
export async function uploadStudentFieldImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const studentId = req.params.id;
    if (!studentId) throw new AppError("Record id is required", 400);
    const fieldKey = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    if (!fieldKey) throw new AppError("Field key is required", 400);
    if (!req.file) {
      throw new AppError("Image file is required (field name: image)", 400);
    }

    const studentResult = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT} FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) throw new AppError("Record not found", 404);
    assertStudentBelongsToOrg(req.user, student);
    const orgId = student.institute_id ?? student.school_id;
    if (!orgId) throw new AppError("Record is not assigned to an organization", 400);

    const formFields = await loadFormConfigForOrg({
      schoolId: student.school_id,
      instituteId: student.institute_id,
    });
    const field = formFields.find((f) => f.key === fieldKey);
    if (!field || field.enabled === false) {
      throw new AppError("That field is not part of this form", 400);
    }
    if (field.fieldType !== "photo") {
      throw new AppError("That field is not an image field", 400);
    }

    const stored = await uploadStudentFieldImageToStorage(orgId, student.id, fieldKey, req.file);
    const url = `${stored}?v=${Date.now()}`;

    const updated = await pool.query<TeacherStudentRow>(
      `UPDATE students
       SET extra_fields = COALESCE(extra_fields, '{}'::jsonb) || jsonb_build_object($1::text, $2::text),
           updated_at = NOW()
       WHERE id = $3 AND (school_id = $4 OR institute_id = $4)
       RETURNING ${TEACHER_STUDENT_SELECT}`,
      [fieldKey, url, student.id, orgId]
    );
    const row = updated.rows[0];
    if (!row) throw new AppError("Failed to save image", 500);
    res.status(200).json({ status: "ok", url, student: await presentStudent(row) });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /teacher/students/:id — update student details after capture (Add Details).
 */
export async function updateTeacherStudent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const studentId = req.params.id;
    if (!studentId) {
      throw new AppError("Student id is required", 400);
    }

    const studentResult = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT}
       FROM students
       WHERE id = $1
       LIMIT 1`,
      [studentId]
    );

    const student = studentResult.rows[0];
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    assertStudentBelongsToOrg(req.user, student);

    if (!isInstituteStaff(req.user)) {
      assertTeacherScope(req.user, {
        schoolId: student.school_id!,
        classSection: student.class_section,
      });
    }

    await assertRecordEditAllowed(student.school_id, student.institute_id, {
      studentName: student.student_name,
      classSection: student.class_section,
      institute: Boolean(student.institute_id && !student.school_id),
      record: student as unknown as Record<string, unknown>,
    });
    if (
      requestedIdentityChange(req.body as Record<string, unknown>, student.photo_id)
    ) {
      throw new AppError("Photo ID cannot be changed", 400);
    }
    const requestedName = [req.body.student_name, req.body.studentName, req.body.name].find(
      (value) => value !== undefined && value !== null
    );
    const studentName =
      requestedName !== undefined ? String(requestedName).trim() : student.student_name;
    if (!studentName) {
      throw new AppError("Name is required", 400);
    }

    // Class cannot be changed in the edit form (like the photo number).
    const classSection = student.class_section;

    let parentName =
      req.body.parent_name !== undefined || req.body.parentName !== undefined
        ? nullableText(req.body.parent_name ?? req.body.parentName)
        : student.parent_name;

    let parentPhone =
      req.body.parent_phone !== undefined ||
      req.body.parentPhone !== undefined ||
      req.body.phone_number !== undefined ||
      req.body.phoneNumber !== undefined
        ? nullableText(
            req.body.parent_phone ??
              req.body.parentPhone ??
              req.body.phone_number ??
              req.body.phoneNumber
          )
        : student.parent_phone;

    let address =
      req.body.address !== undefined ? nullableText(req.body.address) : student.address;

    const body = req.body as Record<string, unknown>;
    let rollNo =
      body.roll_no !== undefined || body.rollNo !== undefined
        ? String(body.roll_no ?? body.rollNo).trim() || null
        : student.roll_no;
    let dob =
      optionalBodyString(body, ["dob"]) !== undefined
        ? optionalBodyString(body, ["dob"]) ?? null
        : student.dob;
    let gender =
      optionalBodyString(body, ["gender"]) !== undefined
        ? optionalBodyString(body, ["gender"]) ?? null
        : student.gender;
    let bloodGroup =
      optionalBodyString(body, ["blood_group", "bloodGroup"]) !== undefined
        ? optionalBodyString(body, ["blood_group", "bloodGroup"]) ?? null
        : student.blood_group;
    let custom1 =
      optionalBodyString(body, ["custom_1", "custom1"]) !== undefined
        ? optionalBodyString(body, ["custom_1", "custom1"]) ?? null
        : student.custom_1;
    let custom2 =
      optionalBodyString(body, ["custom_2", "custom2"]) !== undefined
        ? optionalBodyString(body, ["custom_2", "custom2"]) ?? null
        : student.custom_2;
    let custom3 =
      optionalBodyString(body, ["custom_3", "custom3"]) !== undefined
        ? optionalBodyString(body, ["custom_3", "custom3"]) ?? null
        : student.custom_3;

    if (
      !isInstituteStaff(req.user) &&
      !isSchoolWideTeacher(req.user) &&
      classSection !== student.class_section
    ) {
      throw new AppError(
        "You can only edit students in your assigned class",
        403
      );
    }

    // Data safety (point 13): an empty/missing value must NEVER wipe an existing
    // value. Editing or uploading one field keeps every other field unchanged.
    if (!parentName && student.parent_name) parentName = student.parent_name;
    if (!parentPhone && student.parent_phone) parentPhone = student.parent_phone;
    if (!address && student.address) address = student.address;
    if (!rollNo && student.roll_no) rollNo = student.roll_no;
    if (!dob && student.dob) dob = student.dob;
    if (!gender && student.gender) gender = student.gender;
    if (!bloodGroup && student.blood_group) bloodGroup = student.blood_group;
    if (!custom1 && student.custom_1) custom1 = student.custom_1;
    if (!custom2 && student.custom_2) custom2 = student.custom_2;
    if (!custom3 && student.custom_3) custom3 = student.custom_3;

    const existingExtra = parseExtraFields(student.extra_fields);
    const incomingExtra = parseExtraFields(body.extra_fields ?? body.extraFields);
    const mergedExtra: Record<string, string | null> = { ...existingExtra };
    for (const [k, v] of Object.entries(incomingExtra)) {
      const nv = v == null ? "" : String(v).trim();
      const had = (existingExtra[k] == null ? "" : String(existingExtra[k]).trim());
      if (nv) mergedExtra[k] = nv;        // non-empty incoming overwrites
      else if (!had) mergedExtra[k] = null; // empty incoming only when nothing existed
      // else: keep the existing non-empty value (do not wipe)
    }
    delete mergedExtra.photo_id;
    delete mergedExtra.photoId;
    delete mergedExtra.student_name;
    delete mergedExtra.studentName;

    {
      // Class fields are locked; fixed columns follow edited (or emptied) Excel fields.
      const fields = await loadFormConfigForOrg({
        schoolId: student.school_id ?? null,
        instituteId: student.institute_id ?? null,
      });
      for (const key of classFieldKeys(fields)) {
        if (key !== "class_section" && key in mergedExtra) mergedExtra[key] = existingExtra[key] ?? null;
      }
      const sync = canonicalSyncFromExtra(fields, incomingExtra);
      if ("roll_no" in sync) rollNo = sync.roll_no ?? null;
      if ("parent_name" in sync) parentName = sync.parent_name ?? null;
      if ("parent_phone" in sync) parentPhone = sync.parent_phone ?? null;
      if ("address" in sync) address = sync.address ?? null;
      if ("dob" in sync) dob = sync.dob ?? null;
      if ("gender" in sync) gender = sync.gender ?? null;
      if ("blood_group" in sync) bloodGroup = sync.blood_group ?? null;
    }

    const updated = await pool.query<TeacherStudentRow>(
      `UPDATE students
       SET student_name = $1,
           class_section = $2,
           parent_name = $3,
           parent_phone = $4,
           address = $5,
           roll_no = $6,
           dob = $7,
           gender = $8,
           blood_group = $9,
           custom_1 = $10,
           custom_2 = $11,
           custom_3 = $12,
           extra_fields = $13::jsonb,
           updated_at = NOW()
       WHERE id = $14
       RETURNING ${TEACHER_STUDENT_SELECT}`,
      [
        studentName,
        classSection,
        parentName,
        parentPhone,
        address,
        rollNo,
        dob,
        gender,
        bloodGroup,
        custom1,
        custom2,
        custom3,
        JSON.stringify(mergedExtra),
        student.id,
      ]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError("Failed to update student", 500);
    }

    res.status(200).json({
      status: "ok",
      student: await presentStudent(row),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteStudentPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const studentId = req.params.id;
    if (!studentId) {
      throw new AppError("Student id is required", 400);
    }

    const studentResult = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT}
       FROM students
       WHERE id = $1
       LIMIT 1`,
      [studentId]
    );

    const student = studentResult.rows[0];
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    assertStudentBelongsToOrg(req.user, student);

    const orgId = studentPhotoOrgId(student.school_id, student.institute_id);
    if (!orgId) {
      throw new AppError("Student is not assigned to an organization", 400);
    }

    if (!isInstituteStaff(req.user)) {
      assertTeacherScope(req.user, {
        schoolId: student.school_id!,
        classSection: student.class_section,
      });
    }

    await deleteStudentPhotoFromStorage(orgId, student.id);

    const updated = await pool.query<TeacherStudentRow>(
      `UPDATE students
       SET photo_url = NULL,
           photo_captured_at = NULL,
           photo_cropped = false,
           status = 'pending',
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${TEACHER_STUDENT_SELECT}`,
      [student.id]
    );

    const updatedStudent = updated.rows[0];
    if (!updatedStudent) {
      throw new AppError("Failed to reset student photo", 500);
    }

    res.status(200).json({
      status: "ok",
      student: await presentStudent(updatedStudent),
    });
  } catch (error) {
    next(error);
  }
}

export async function getTeacherProgress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    if (isInstituteStaff(req.user)) {
      const instituteId = getTeacherOrgId(req.user);
      const result = await pool.query<{
        total_students: string;
        captured: string;
        uncaptured: string;
      }>(
        `SELECT
           COUNT(*)::text AS total_students,
           COUNT(*) FILTER (WHERE photo_url IS NOT NULL AND btrim(photo_url) <> '')::text AS captured,
           COUNT(*) FILTER (WHERE photo_url IS NULL OR btrim(photo_url) = '')::text AS uncaptured
         FROM students
         WHERE app_visible = true AND institute_id = $1`,
        [instituteId]
      );
      const row = result.rows[0];
      res.status(200).json({
        totalStudents: Number(row?.total_students ?? 0),
        captured: Number(row?.captured ?? 0),
        uncaptured: Number(row?.uncaptured ?? 0),
      });
      return;
    }

    const schoolId = getTeacherSchoolId(req.user);
    const values: unknown[] = [schoolId];
    let scopeSql = "";

    if (!isSchoolWideTeacher(req.user)) {
      const filter = getTeacherDataFilter(req.user);
      values.push(filter.classSection);
      scopeSql = `AND class_section = $2`;
    }

    const result = await pool.query<{
      total_students: string;
      captured: string;
      uncaptured: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_students,
         COUNT(*) FILTER (WHERE photo_url IS NOT NULL AND btrim(photo_url) <> '')::text AS captured,
         COUNT(*) FILTER (WHERE photo_url IS NULL OR btrim(photo_url) = '')::text AS uncaptured
       FROM students
       WHERE app_visible = true AND school_id = $1
         ${scopeSql}`,
      values
    );

    const row = result.rows[0];

    res.status(200).json({
      totalStudents: Number(row?.total_students ?? 0),
      captured: Number(row?.captured ?? 0),
      uncaptured: Number(row?.uncaptured ?? 0),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * School Mode home: school header + Sections & Classes list with photo progress.
 */
type GroupFieldInfo = { key: string; label: string; column: string | null };

/** The form's configured grouping field ("Group by this"), else Class/Group. */
function resolveGroupField(
  fields: { key: string; label: string; enabled?: boolean; isGroup?: boolean }[],
  orgType: "school" | "institute"
): GroupFieldInfo {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const canonicalColumn = (label: string, key: string): string | null => {
    const n = normalize(label);
    if (key === "class_section" || n.includes("class") || n.includes("standard") || n.includes("section") || n.includes("grade") || n === "std") return "class_section";
    if (n.includes("blood")) return "blood_group";
    if (n === "gender" || n.includes("gender") || n.includes("sex")) return "gender";
    return null;
  };
  const group = fields.find((ff) => ff.enabled !== false && ff.isGroup === true);
  if (group) {
    return { key: group.key, label: (group.label || "Group").trim(), column: canonicalColumn(group.label, group.key) };
  }
  return { key: "class_section", label: orgType === "institute" ? "Group" : "Class", column: "class_section" };
}

/** SQL expression yielding the group value; $keyParam binds the field key for the extra_fields lookup. */
function groupValueExpr(column: string | null, keyParam: number): string {
  const extra = `NULLIF(btrim(extra_fields->>$${keyParam}), '')`;
  if (column === "class_section") return `COALESCE(NULLIF(btrim(class_section), ''), ${extra})`;
  if (column === "blood_group") return `COALESCE(NULLIF(btrim(blood_group), ''), ${extra})`;
  if (column === "gender") return `COALESCE(NULLIF(btrim(gender), ''), ${extra})`;
  return extra;
}


export async function getTeacherHome(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteMode = isInstituteStaff(req.user);
    const orgType: "school" | "institute" = instituteMode ? "institute" : "school";
    const orgCol = instituteMode ? "institute_id" : "school_id";
    const orgId = instituteMode ? getTeacherOrgId(req.user) : getTeacherSchoolId(req.user);

    const orgRow = instituteMode
      ? (await pool.query<{ name: string; logo_url: string | null }>(
          `SELECT name, logo_url FROM institutes WHERE id = $1`,
          [orgId]
        )).rows[0]
      : (await pool.query<{ name: string; logo_url: string | null }>(
          `SELECT name, logo_url FROM schools WHERE id = $1`,
          [orgId]
        )).rows[0];

    const fields = await loadFormConfigForOrg(
      instituteMode ? { instituteId: orgId } : { schoolId: orgId }
    );
    const groupField = resolveGroupField(fields, orgType);
    const groupExpr = groupValueExpr(groupField.column, 2);

    const schoolWide = instituteMode ? true : isSchoolWideTeacher(req.user);
    const params: unknown[] = [orgId, groupField.key];
    let scopeSql = "";
    if (!instituteMode && !schoolWide) {
      const filter = getTeacherDataFilter(req.user);
      params.push(filter.classSection);
      scopeSql = `AND class_section = $3`;
    }

    const rows = await pool.query<{
      group_value: string | null;
      total_students: string;
      captured: string;
      uncaptured: string;
    }>(
      `SELECT ${groupExpr} AS group_value,
         COUNT(*)::text AS total_students,
         COUNT(*) FILTER (WHERE photo_url IS NOT NULL AND btrim(photo_url) <> '')::text AS captured,
         COUNT(*) FILTER (WHERE photo_url IS NULL OR btrim(photo_url) = '')::text AS uncaptured
       FROM students
       WHERE app_visible = true AND ${orgCol} = $1 ${scopeSql}
       GROUP BY ${groupExpr}
       ORDER BY group_value ASC NULLS LAST`,
      params
    );

    const classes = rows.rows.map((r) => {
      const value = (r.group_value ?? "").trim();
      return {
        class_section: value,
        value,
        label: value || "Unassigned",
        totalStudents: Number(r.total_students),
        captured: Number(r.captured),
        uncaptured: Number(r.uncaptured),
      };
    });

    const overall = classes.reduce(
      (acc, item) => {
        acc.totalStudents += item.totalStudents;
        acc.captured += item.captured;
        acc.uncaptured += item.uncaptured;
        return acc;
      },
      { totalStudents: 0, captured: 0, uncaptured: 0 }
    );

    res.status(200).json({
      status: "ok",
      orgType,
      schoolName: orgRow?.name ?? (instituteMode ? "Your Institute" : "Your School"),
      schoolLogoUrl: orgRow?.logo_url ?? null,
      groupKey: groupField.key,
      groupLabel: groupField.label,
      overall,
      classes,
    });
  } catch (error) {
    next(error);
  }
}

export async function listTeacherModels(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const orgId = getTeacherOrgId(req.user);
    const orgTable = req.user.role === "organization_staff" ? "organizations" : isInstituteStaff(req.user) ? "institutes" : "schools";
    const ownerAdminId = await loadOrgOwnerAdminId(orgTable, orgId);
    if (!ownerAdminId) {
      res.status(200).json({ status: "ok", count: 0, models: [], tags: [] });
      return;
    }
    const [modelsResult, tagsResult] = await Promise.all([
      pool.query<TeacherModelRow>(
        `SELECT id, kind, name, description, image_url, video_url, extra_image_urls, created_at
         FROM catalog_items
         WHERE kind = 'model' AND owner_admin_id = $1
         ORDER BY created_at DESC`,
        [ownerAdminId]
      ),
      pool.query<TeacherModelRow>(
        `SELECT id, kind, name, description, image_url, video_url, extra_image_urls, created_at
         FROM catalog_items
         WHERE kind = 'tag' AND owner_admin_id = $1
         ORDER BY created_at DESC`,
        [ownerAdminId]
      ),
    ]);
    const models = modelsResult.rows.map((row) => ({
      ...row,
      kind: "model" as const,
    }));
    const tags = tagsResult.rows.map((row) => ({
      ...row,
      kind: "tag" as const,
    }));
    res.status(200).json({
      status: "ok",
      count: models.length + tags.length,
      models,
      tags,
    });
  } catch (error) {
    next(error);
  }
}
