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
  if (fromField) return { photoId: fromField, allocate: false };
  if (requested) return { photoId: requested, allocate: false };
  if (identityFields(fields).length > 0) return { photoId: null, allocate: false };
  return { photoId: null, allocate: true };
}

interface TeacherStudentRow {
  id: string;
  student_name: string;
  roll_no: string | null;
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
}

interface TeacherModelRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string | null;
}

const TEACHER_STUDENT_SELECT = `
  id, student_name, roll_no, photo_url, photo_captured_at, signature_url, status, school_id, institute_id, class_section,
  parent_name, parent_phone, address, photo_id,
  dob, gender, blood_group, custom_1, custom_2, custom_3, extra_fields, field_labels
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
    pending_photo: !hasCapturedPhoto(row.photo_url),
    pending_data: !dataComplete,
    fully_captured: hasCapturedPhoto(row.photo_url) && dataComplete,
  };
}

async function presentStudent(row: TeacherStudentRow) {
  const ctx = await loadRequiredDataContext(row.school_id, row.institute_id);
  return toStudentJson(row, ctx);
}

async function presentStudents(rows: TeacherStudentRow[]) {
  if (rows.length === 0) return [];
  const ctx = await loadRequiredDataContext(rows[0].school_id, rows[0].institute_id);
  return rows.map((row) => toStudentJson(row, ctx));
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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({ status: "ok", fields });
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

    if (isInstituteStaff(req.user)) {
      const instituteId = getTeacherOrgId(req.user);
      const result = await pool.query<TeacherStudentRow>(
        `SELECT ${TEACHER_STUDENT_SELECT}
         FROM students
         WHERE institute_id = $1
         ORDER BY student_name ASC, roll_no ASC NULLS LAST`,
        [instituteId]
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
    let classSection: string;

    if (isSchoolWideTeacher(req.user)) {
      schoolId = getTeacherSchoolId(req.user);
      if (!queryClassSection) {
        const result = await pool.query<TeacherStudentRow>(
          `SELECT ${TEACHER_STUDENT_SELECT}
           FROM students
           WHERE school_id = $1
           ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
          [schoolId]
        );

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.status(200).json({
          status: "ok",
          count: result.rows.length,
          students: await presentStudents(result.rows),
        });
        return;
      }
      classSection = queryClassSection;
    } else {
      const filter = getTeacherDataFilter(req.user);
      schoolId = filter.schoolId;
      classSection = queryClassSection || filter.classSection;
      assertTeacherScope(req.user, {
        schoolId,
        classSection,
      });
    }

    const result = await pool.query<TeacherStudentRow>(
      `SELECT ${TEACHER_STUDENT_SELECT}
       FROM students
       WHERE school_id = $1
         AND class_section = $2
       ORDER BY roll_no ASC NULLS LAST, student_name ASC`,
      [schoolId, classSection]
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

      const photoUrl = await uploadStudentPhotoToStorage(orgId, current.id, req.file);

      const updated = await client.query<TeacherStudentRow>(
        `UPDATE students
         SET photo_url = $1,
             status = 'captured',
             photo_captured_at = NOW(),
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
       SET signature_url = $1, updated_at = NOW()
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
    if (
      requestedName !== undefined &&
      String(requestedName).trim() !== (student.student_name ?? "").trim()
    ) {
      throw new AppError("Name cannot be changed", 400);
    }

    const studentName = student.student_name;
    if (!studentName) {
      throw new AppError("Name is required", 400);
    }

    let classSection = student.class_section;
    if (
      req.body.class_section !== undefined ||
      req.body.classSection !== undefined
    ) {
      classSection =
        nullableText(req.body.class_section ?? req.body.classSection) ||
        (isInstituteStaff(req.user) ? student.class_section || "ALL" : "");
    } else if (
      req.body.class !== undefined ||
      req.body.section !== undefined
    ) {
      const className =
        req.body.class !== undefined
          ? String(req.body.class).trim()
          : student.class_section;
      const section =
        req.body.section !== undefined
          ? String(req.body.section).trim()
          : "";
      classSection = section ? `${className} ${section}`.trim() : className;
    }
    if (!classSection && !isInstituteStaff(req.user)) {
      throw new AppError("Class / Section is required", 400);
    }
    if (!classSection && isInstituteStaff(req.user)) {
      classSection = student.class_section || "ALL";
    }

    const parentName =
      req.body.parent_name !== undefined || req.body.parentName !== undefined
        ? nullableText(req.body.parent_name ?? req.body.parentName)
        : student.parent_name;

    const parentPhone =
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

    if (parentPhone && !/^\d+$/.test(parentPhone)) {
      throw new AppError("Parent phone number must be numeric", 400);
    }

    const address =
      req.body.address !== undefined ? nullableText(req.body.address) : student.address;

    const body = req.body as Record<string, unknown>;
    const rollNo =
      body.roll_no !== undefined || body.rollNo !== undefined
        ? String(body.roll_no ?? body.rollNo).trim() || null
        : student.roll_no;
    const dob =
      optionalBodyString(body, ["dob"]) !== undefined
        ? optionalBodyString(body, ["dob"]) ?? null
        : student.dob;
    const gender =
      optionalBodyString(body, ["gender"]) !== undefined
        ? optionalBodyString(body, ["gender"]) ?? null
        : student.gender;
    const bloodGroup =
      optionalBodyString(body, ["blood_group", "bloodGroup"]) !== undefined
        ? optionalBodyString(body, ["blood_group", "bloodGroup"]) ?? null
        : student.blood_group;
    const custom1 =
      optionalBodyString(body, ["custom_1", "custom1"]) !== undefined
        ? optionalBodyString(body, ["custom_1", "custom1"]) ?? null
        : student.custom_1;
    const custom2 =
      optionalBodyString(body, ["custom_2", "custom2"]) !== undefined
        ? optionalBodyString(body, ["custom_2", "custom2"]) ?? null
        : student.custom_2;
    const custom3 =
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

    const existingExtra = parseExtraFields(student.extra_fields);
    const incomingExtra = parseExtraFields(body.extra_fields ?? body.extraFields);
    const mergedExtra =
      Object.keys(incomingExtra).length > 0
        ? { ...existingExtra, ...incomingExtra }
        : existingExtra;
    delete mergedExtra.photo_id;
    delete mergedExtra.photoId;
    delete mergedExtra.student_name;
    delete mergedExtra.studentName;

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
      student: toStudentJson(row),
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
           COUNT(*) FILTER (WHERE status IN ('captured', 'printed'))::text AS captured,
           COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'captured' AND status IS DISTINCT FROM 'printed')::text AS uncaptured
         FROM students
         WHERE institute_id = $1`,
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
         COUNT(*) FILTER (WHERE status IN ('captured', 'printed'))::text AS captured,
         COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'captured' AND status IS DISTINCT FROM 'printed')::text AS uncaptured
       FROM students
       WHERE school_id = $1
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
export async function getTeacherHome(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    if (isInstituteStaff(req.user)) {
      const instituteId = getTeacherOrgId(req.user);
      const institute = await pool.query<{
        name: string;
        logo_url: string | null;
      }>(`SELECT name, logo_url FROM institutes WHERE id = $1`, [instituteId]);

      const counts = await pool.query<{
        total_students: string;
        captured: string;
        uncaptured: string;
      }>(
        `SELECT
           COUNT(*)::text AS total_students,
           COUNT(*) FILTER (WHERE status IN ('captured', 'printed'))::text AS captured,
           COUNT(*) FILTER (
             WHERE status IS DISTINCT FROM 'captured'
               AND status IS DISTINCT FROM 'printed'
           )::text AS uncaptured
         FROM students
         WHERE institute_id = $1`,
        [instituteId]
      );

      const row = counts.rows[0];
      const totalStudents = Number(row?.total_students ?? 0);
      const captured = Number(row?.captured ?? 0);
      const uncaptured = Number(row?.uncaptured ?? 0);

      res.status(200).json({
        status: "ok",
        orgType: "institute",
        schoolName: institute.rows[0]?.name ?? "Your Institute",
        schoolLogoUrl: institute.rows[0]?.logo_url ?? null,
        overall: { totalStudents, captured, uncaptured },
        classes: [],
      });
      return;
    }

    const schoolId = getTeacherSchoolId(req.user);
    const schoolWide = isSchoolWideTeacher(req.user);

    const school = await pool.query<{
      name: string;
      logo_url: string | null;
    }>(`SELECT name, logo_url FROM schools WHERE id = $1`, [schoolId]);

    const values: unknown[] = [schoolId];
    let scopeSql = "";
    if (!schoolWide) {
      const filter = getTeacherDataFilter(req.user);
      values.push(filter.classSection);
      scopeSql = `AND class_section = $2`;
    }

    const classRows = await pool.query<{
      class_section: string;
      total_students: string;
      captured: string;
      uncaptured: string;
    }>(
      `SELECT
         class_section,
         COUNT(*)::text AS total_students,
         COUNT(*) FILTER (WHERE status IN ('captured', 'printed'))::text AS captured,
         COUNT(*) FILTER (
           WHERE status IS DISTINCT FROM 'captured'
             AND status IS DISTINCT FROM 'printed'
         )::text AS uncaptured
       FROM students
       WHERE school_id = $1
         ${scopeSql}
       GROUP BY class_section
       ORDER BY class_section ASC`,
      values
    );

    const classes = classRows.rows.map((row) => {
      const totalStudents = Number(row.total_students);
      const captured = Number(row.captured);
      const uncaptured = Number(row.uncaptured);
      return {
        class_section: row.class_section,
        totalStudents,
        captured,
        uncaptured,
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
      orgType: "school",
      schoolName: school.rows[0]?.name ?? "Your School",
      schoolLogoUrl: school.rows[0]?.logo_url ?? null,
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
    const orgTable = isInstituteStaff(req.user) ? "institutes" : "schools";
    const ownerAdminId = await loadOrgOwnerAdminId(orgTable, orgId);
    if (!ownerAdminId) {
      res.status(200).json({ status: "ok", count: 0, models: [], tags: [] });
      return;
    }
    const [modelsResult, tagsResult] = await Promise.all([
      pool.query<TeacherModelRow>(
        `SELECT id, kind, name, description, image_url, video_url, created_at
         FROM catalog_items
         WHERE kind = 'model' AND owner_admin_id = $1
         ORDER BY created_at DESC`,
        [ownerAdminId]
      ),
      pool.query<TeacherModelRow>(
        `SELECT id, kind, name, description, image_url, video_url, created_at
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
