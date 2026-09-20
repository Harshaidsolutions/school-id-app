import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { assertTeacherScope } from "../utils/teacherScope";
import {
  assertStudentBelongsToOrg,
  isInstituteStaff,
} from "../utils/teacherOrgScope";
import { renderCardPreviewPng } from "../utils/cardPreview";

export async function getTeacherCardPreview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const { id } = req.params;
    if (!id) throw new AppError("Student id is required", 400);

    const studentResult = await pool.query<{
      id: string;
      student_name: string;
      class_section: string;
      roll_no: string | null;
      photo_url: string | null;
      school_id: string | null;
      institute_id: string | null;
      status: string | null;
    }>(
      `SELECT id, student_name, class_section, roll_no, photo_url, school_id, institute_id, status
       FROM students WHERE id = $1 LIMIT 1`,
      [id]
    );

    const student = studentResult.rows[0];
    if (!student) throw new AppError("Student not found", 404);

    assertStudentBelongsToOrg(req.user, student);

    if (!isInstituteStaff(req.user)) {
      if (!student.school_id) {
        throw new AppError("Student is not assigned to a school", 400);
      }
      assertTeacherScope(req.user, {
        schoolId: student.school_id,
        classSection: student.class_section,
      });
    }

    const orgId = student.school_id ?? student.institute_id;
    if (!orgId) {
      throw new AppError("Student is not assigned to an organization", 400);
    }

    const schoolResult = isInstituteStaff(req.user)
      ? await pool.query<{ name: string; template_id: string | null }>(
          `SELECT name, template_id FROM institutes WHERE id = $1`,
          [orgId]
        )
      : await pool.query<{ name: string; template_id: string | null }>(
          `SELECT name, template_id FROM schools WHERE id = $1`,
          [orgId]
        );
    const school = schoolResult.rows[0];

    let templateImageUrl: string | null = null;
    if (school?.template_id) {
      const template = await pool.query<{ image_url: string | null }>(
        `SELECT image_url FROM templates WHERE id = $1 LIMIT 1`,
        [school.template_id]
      );
      templateImageUrl = template.rows[0]?.image_url ?? null;
    }

    const preview = await renderCardPreviewPng({
      studentId: student.id,
      schoolId: orgId,
      name: student.student_name,
      className: student.class_section,
      rollNo: student.roll_no ?? "",
      photoUrl: student.photo_url,
      templateImageUrl,
      schoolName: school?.name ?? null,
    });

    res.status(200).json({
      status: "ok",
      student: {
        id: student.id,
        student_name: student.student_name,
        class_section: student.class_section,
        roll_no: student.roll_no,
        photo_url: student.photo_url,
        status: student.status,
      },
      previewUrl: preview.previewUrl,
      previewBase64: preview.previewBase64,
    });
  } catch (error) {
    next(error);
  }
}
