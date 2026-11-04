import { Request, Response, NextFunction } from "express";
import multer from "multer";
import sharp from "sharp";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { STUDENT_PHOTOS_BUCKET, studentPhotoOrgId, uploadBufferToBucket } from "../config/storage";
import { assertStudentOwnedByAdmin, requireAdminScope } from "../utils/adminScope";

/** One generated ID card image (front side) per request, sent by the ID card generator. */
export const generatedCardUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
}).single("image");

/**
 * POST /admin/students/:studentId/id-card
 * Saves the generated ID card so the teacher app shows the card instead of the plain photo.
 */
export async function uploadStudentIdCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const studentId = typeof req.params.studentId === "string" ? req.params.studentId.trim() : "";
    if (!studentId) throw new AppError("Student id is required", 400);
    if (!req.file?.buffer?.length) throw new AppError("Card image is required", 400);
    const result = await pool.query<{ id: string; school_id: string | null; institute_id: string | null }>(
      `SELECT id, school_id, institute_id FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = result.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);
    const orgId = studentPhotoOrgId(student.school_id, student.institute_id);
    if (!orgId) throw new AppError("Record is not linked to a school or institute", 400);

    // Phone-friendly copy: at most 900 px wide, good-quality JPEG.
    const jpeg = await sharp(req.file.buffer).rotate().resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const version = Date.now();
    const url = await uploadBufferToBucket(STUDENT_PHOTOS_BUCKET, `${orgId}/id-cards/${studentId}.jpg`, jpeg, "image/jpeg");
    const versioned = `${url}?v=${version}`;
    await pool.query(`UPDATE students SET id_card_url = $2, id_card_updated_at = NOW() WHERE id = $1`, [studentId, versioned]);
    res.status(200).json({ status: "ok", id_card_url: versioned });
  } catch (error) {
    next(error);
  }
}
