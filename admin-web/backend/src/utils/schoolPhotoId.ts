import type { PoolClient } from "pg";
import { AppError } from "../middleware/errorHandler";

const SCHOOL_CAPTURE_ID = /^ADD_\d{3,}$/;

export function isSchoolCapturePhotoId(photoId: string | null | undefined): boolean {
  return SCHOOL_CAPTURE_ID.test(String(photoId ?? "").trim());
}

export function formatSchoolPhotoId(sequence: number): string {
  return `ADD_${String(sequence).padStart(3, "0")}`;
}

/** Atomically allocate the next school capture id (ADD_001, ADD_002, …). */
export async function allocateSchoolPhotoId(
  client: PoolClient,
  schoolId: string
): Promise<string> {
  await client.query(`SELECT id FROM schools WHERE id = $1::uuid FOR UPDATE`, [schoolId]);

  const result = await client.query<{ photo_capture_seq: number }>(
    `UPDATE schools
     SET photo_capture_seq = COALESCE(photo_capture_seq, 0) + 1
     WHERE id = $1::uuid
     RETURNING photo_capture_seq`,
    [schoolId]
  );

  const sequence = result.rows[0]?.photo_capture_seq;
  if (!sequence) {
    throw new AppError("School not found", 404);
  }

  return formatSchoolPhotoId(sequence);
}
