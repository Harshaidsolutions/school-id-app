import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";

/**
 * Data integrity: one photo number = one record inside a school / institute, so a photo
 * can never be matched to (or downloaded for) two records.
 */
export async function assertPhotoNumberFree(
  scope: { schoolId?: string | null; instituteId?: string | null },
  photoId: string | null | undefined
): Promise<void> {
  const value = String(photoId ?? "").trim();
  if (!value) return;
  const column = scope.schoolId ? "school_id" : "institute_id";
  const orgId = scope.schoolId ?? scope.instituteId;
  if (!orgId) return;
  const found = await pool.query(
    `SELECT 1 FROM students WHERE ${column} = $1 AND lower(btrim(photo_id)) = lower($2) LIMIT 1`,
    [orgId, value]
  );
  if (found.rows.length) {
    throw new AppError(`Photo number ${value} already exists. Each record needs its own photo number.`, 409);
  }
}
