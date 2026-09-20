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
  uploadStudentPhotoToStorage,
} from "../config/storage";
import { loadFormConfigForOrg } from "./formConfigController";
import { parseExtraFields } from "../utils/studentFieldAccess";
import {
  assertStudentBelongsToOrg,
  getTeacherOrgId,
  isInstituteStaff,
} from "../utils/teacherOrgScope";
import {
  allocateInstitutePhotoId,
  isInstituteCapturePhotoId,
} from "../utils/institutePhotoId";
import { studentPhotoOrgId } from "../config/storage";

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
  created_at: string | null;
}

const TEACHER_STUDENT_SELECT = `
  id, student_name, roll_no, photo_url, photo_captured_at, status, school_id, institute_id, class_section,
  parent_name, parent_phone, address, photo_id,
  dob, gender, blood_group, custom_1, custom_2, custom_3, extra_fields, field_labels
`;

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

function toStudentJson(row: TeacherStudentRow) {
  const extraFields = parseExtraFields(row.extra_fields);
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
  };
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
    const fields = await loadFormConfigForOrg({ schoolId, instituteId });
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
        students: result.rows.map(toStudentJson),
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
          students: result.rows.map(toStudentJson),
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
      students: result.rows.map(toStudentJson),
    });
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
      const photoId = photoIdRaw || null;

      const extraFields = parseExtraFields(
        req.body.extra_fields ?? req.body.extraFields
      );

      const result = await pool.query<TeacherStudentRow>(
        `INSERT INTO students
           (institute_id, photo_id, class_section, student_name, parent_name, parent_phone,
            address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
            extra_fields, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, 'pending')
         RETURNING ${TEACHER_STUDENT_SELECT}`,
        [
          instituteId,
          photoId,
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
        ]
      );

      const student = result.rows[0];
      if (!student) {
        throw new AppError("Failed to create member", 500);
      }

      res.status(201).json({
        status: "ok",
        student: toStudentJson(student),
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

    let photoId = String(
      req.body.photo_id ?? req.body.photoId ?? ""
    ).trim();
    if (!photoId) {
      photoId = `T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const extraFields = parseExtraFields(req.body.extra_fields ?? req.body.extraFields);

    const result = await pool.query<TeacherStudentRow>(
      `INSERT INTO students
         (school_id, photo_id, class_section, student_name, parent_name, parent_phone,
          address, roll_no, dob, gender, blood_group, custom_1, custom_2, custom_3,
          extra_fields, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, 'pending')
       RETURNING ${TEACHER_STUDENT_SELECT}`,
      [
        schoolId,
        photoId,
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
      ]
    );

    const student = result.rows[0];
    if (!student) {
      throw new AppError("Failed to create student", 500);
    }

    res.status(201).json({
      status: "ok",
      student: toStudentJson(student),
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

    const photoUrl = await uploadStudentPhotoToStorage(
      orgId,
      student.id,
      req.file
    );

    const instituteId = student.institute_id;
    const instituteCapture = Boolean(instituteId);

    const client = await pool.connect();
    let updatedStudent: TeacherStudentRow | undefined;
    try {
      await client.query("BEGIN");

      let capturePhotoId: string | null = null;
      if (instituteCapture && instituteId) {
        if (isInstituteCapturePhotoId(student.photo_id)) {
          capturePhotoId = student.photo_id!.trim();
        } else {
          capturePhotoId = await allocateInstitutePhotoId(client, instituteId);
        }
      }

      const updated = await client.query<TeacherStudentRow>(
        instituteCapture
          ? `UPDATE students
             SET photo_url = $1,
                 photo_id = $2,
                 status = 'captured',
                 photo_captured_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING ${TEACHER_STUDENT_SELECT}`
          : `UPDATE students
             SET photo_url = $1,
                 status = 'captured',
                 photo_captured_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2
             RETURNING ${TEACHER_STUDENT_SELECT}`,
        instituteCapture
          ? [photoUrl, capturePhotoId, student.id]
          : [photoUrl, student.id]
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
      student: toStudentJson(updatedStudent),
    });
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

    const studentName =
      req.body.student_name !== undefined ||
      req.body.studentName !== undefined ||
      req.body.name !== undefined
        ? String(
            req.body.student_name ?? req.body.studentName ?? req.body.name
          ).trim()
        : student.student_name;
    if (!studentName) {
      throw new AppError("Name is required", 400);
    }

    let classSection = student.class_section;
    if (
      req.body.class_section !== undefined ||
      req.body.classSection !== undefined
    ) {
      classSection = String(
        req.body.class_section ?? req.body.classSection
      ).trim();
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
        ? String(req.body.parent_name ?? req.body.parentName).trim() || null
        : student.parent_name;

    const parentPhone =
      req.body.parent_phone !== undefined ||
      req.body.parentPhone !== undefined ||
      req.body.phone_number !== undefined ||
      req.body.phoneNumber !== undefined
        ? String(
            req.body.parent_phone ??
              req.body.parentPhone ??
              req.body.phone_number ??
              req.body.phoneNumber
          ).trim() || null
        : student.parent_phone;

    if (parentPhone && !/^\d+$/.test(parentPhone)) {
      throw new AppError("Parent phone number must be numeric", 400);
    }

    const address =
      req.body.address !== undefined
        ? String(req.body.address).trim() || null
        : student.address;

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
      student: toStudentJson(updatedStudent),
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
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [modelsResult, tagsResult] = await Promise.all([
      pool.query<TeacherModelRow>(
        `SELECT id, kind, name, description, image_url, created_at
         FROM catalog_items
         WHERE kind = 'model'
         ORDER BY created_at DESC`
      ),
      pool.query<TeacherModelRow>(
        `SELECT id, kind, name, description, image_url, created_at
         FROM catalog_items
         WHERE kind = 'tag'
         ORDER BY created_at DESC`
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
