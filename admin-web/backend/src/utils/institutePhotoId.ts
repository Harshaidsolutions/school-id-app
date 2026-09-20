import type { PoolClient } from "pg";
import { AppError } from "../middleware/errorHandler";

const INSTITUTE_CAPTURE_ID = /^ADD_\d{3,}$/;

export function isInstituteCapturePhotoId(
  photoId: string | null | undefined
): boolean {
  return INSTITUTE_CAPTURE_ID.test(String(photoId ?? "").trim());
}

export function formatInstitutePhotoId(sequence: number): string {
  return `ADD_${String(sequence).padStart(3, "0")}`;
}

/** Atomically allocate the next institute capture id (ADD_001, ADD_002, …). */
export async function allocateInstitutePhotoId(
  client: PoolClient,
  instituteId: string
): Promise<string> {
  await client.query(
    `SELECT id FROM institutes WHERE id = $1::uuid FOR UPDATE`,
    [instituteId]
  );

  const result = await client.query<{ photo_capture_seq: number }>(
    `UPDATE institutes
     SET photo_capture_seq = COALESCE(photo_capture_seq, 0) + 1
     WHERE id = $1::uuid
     RETURNING photo_capture_seq`,
    [instituteId]
  );

  const sequence = result.rows[0]?.photo_capture_seq;
  if (!sequence) {
    throw new AppError("Institute not found", 404);
  }

  return formatInstitutePhotoId(sequence);
}
