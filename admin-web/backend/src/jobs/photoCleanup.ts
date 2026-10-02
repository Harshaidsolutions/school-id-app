import cron from "node-cron";
import { pool } from "../config/database";
import {
  deleteStudentPhotoByPath,
  studentPhotoPathFromUrl,
} from "../config/storage";

const RETENTION_DAYS = 7;

export interface CleanupResult {
  scanned: number;
  deleted: number;
  failures: { studentId: string; reason: string }[];
}

/**
 * Finds students whose ID cards were printed more than RETENTION_DAYS ago,
 * removes their photo from S3, and clears photo_url.
 * All other student data is preserved permanently.
 *
 * Individual deletion failures are logged and skipped so one bad object
 * never blocks the rest of the batch.
 */
export async function runPhotoCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = { scanned: 0, deleted: 0, failures: [] };

  const candidates = await pool.query<{
    id: string;
    school_id: string | null;
    photo_url: string | null;
  }>(
    `SELECT id, school_id, photo_url
     FROM students
     WHERE status = 'printed'
       AND printed_at IS NOT NULL
       AND printed_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
       AND photo_url IS NOT NULL`
  );

  result.scanned = candidates.rows.length;

  for (const student of candidates.rows) {
    const path = studentPhotoPathFromUrl(
      student.photo_url,
      student.school_id,
      student.id
    );

    try {
      if (path) {
        await deleteStudentPhotoByPath(path);
      }

      await pool.query(
        `UPDATE students
         SET photo_url = NULL, photo_captured_at = NULL, photo_cropped = false, updated_at = NOW()
         WHERE id = $1`,
        [student.id]
      );

      result.deleted += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failures.push({ studentId: student.id, reason });
      console.error(
        `[photo-cleanup] Failed to delete photo for student ${student.id}: ${reason}`
      );
    }
  }

  console.log(
    `[photo-cleanup] Run complete. Scanned ${result.scanned}, deleted ${result.deleted}, failures ${result.failures.length}.`
  );

  return result;
}

/**
 * Schedules the cleanup to run once daily. Default: 02:00 server time.
 * Override with the PHOTO_CLEANUP_CRON env var (standard cron expression).
 */
export function schedulePhotoCleanup(): void {
  const expression = process.env.PHOTO_CLEANUP_CRON || "0 2 * * *";

  if (!cron.validate(expression)) {
    console.error(
      `[photo-cleanup] Invalid cron expression "${expression}". Job not scheduled.`
    );
    return;
  }

  cron.schedule(expression, () => {
    console.log("[photo-cleanup] Scheduled run starting...");
    runPhotoCleanup().catch((error) => {
      console.error("[photo-cleanup] Scheduled run errored:", error);
    });
  });

  console.log(
    `[photo-cleanup] Daily cleanup scheduled with cron "${expression}".`
  );
}
