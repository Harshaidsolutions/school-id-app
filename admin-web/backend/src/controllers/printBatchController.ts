import { requireAdminScope, assertSchoolOwnedByAdmin } from "../utils/adminScope";
import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { generateIdCardsPdf, IdCardStudent } from "../utils/idCardPdf";
import { uploadPrintPdfToStorage } from "../config/storage";

interface PrintBatchStudentRow extends IdCardStudent {
  school_id: string | null;
}

export async function createPrintBatch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const studentIds = req.body?.studentIds;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new AppError("studentIds must be a non-empty array", 400);
    }

    if (!studentIds.every((id) => typeof id === "string" && id.trim())) {
      throw new AppError("studentIds must contain only non-empty strings", 400);
    }

    const uniqueIds = [...new Set(studentIds.map((id: string) => id.trim()))];

    const studentsResult = await pool.query<PrintBatchStudentRow>(
      `SELECT id, student_name AS name, class_section AS class, roll_no, photo_url, school_id
       FROM students
       WHERE id = ANY($1::uuid[])
       ORDER BY class_section ASC, roll_no ASC NULLS LAST`,
      [uniqueIds]
    );

    const students = studentsResult.rows;
    if (students.length === 0) {
      throw new AppError("No students found for the provided ids", 404);
    }

    const missing = uniqueIds.filter(
      (id) => !students.some((s) => s.id === id)
    );
    if (missing.length > 0) {
      throw new AppError(
        `Some studentIds were not found: ${missing.join(", ")}`,
        404
      );
    }

    const schoolIds = new Set(students.map((s) => s.school_id));
    if (schoolIds.size > 1) {
      throw new AppError(
        "All students in a print batch must belong to the same school",
        400
      );
    }

    const schoolId = students[0]?.school_id ?? req.user.schoolId;
    if (!schoolId) {
      throw new AppError("Unable to determine school for this print batch", 400);
    }

    await assertSchoolOwnedByAdmin(await requireAdminScope(req), schoolId);

    // Create the batch record first so we can name the PDF by its id.
    const batchInsert = await pool.query<{ id: string }>(
      `INSERT INTO print_batches (school_id, student_ids, status, created_by)
       VALUES ($1, $2::uuid[], 'pending', $3)
       RETURNING id`,
      [schoolId, uniqueIds, req.user.userId]
    );

    const printBatchId = batchInsert.rows[0]?.id;
    if (!printBatchId) {
      throw new AppError("Failed to create print batch record", 500);
    }

    let pdfUrl: string;
    try {
      const pdfBytes = await generateIdCardsPdf(
        students.map((s) => ({
          id: s.id,
          name: s.name,
          class: s.class,
          roll_no: s.roll_no,
          photo_url: s.photo_url,
        }))
      );

      pdfUrl = await uploadPrintPdfToStorage(schoolId, printBatchId, pdfBytes);
    } catch (error) {
      // Mark the batch as failed but don't crash the server.
      await pool.query(
        `UPDATE print_batches SET status = 'failed' WHERE id = $1`,
        [printBatchId]
      );
      throw error;
    }

    // Finalize: save pdf url + mark students printed in one transaction.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE print_batches
         SET pdf_url = $1, status = 'completed'
         WHERE id = $2`,
        [pdfUrl, printBatchId]
      );

      await client.query(
        `UPDATE students
         SET status = 'printed', printed_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [uniqueIds]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      success: true,
      printBatchId,
      pdfUrl,
    });
  } catch (error) {
    next(error);
  }
}

export async function listPrintBatches(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { schoolId } = req.params;
    if (!schoolId) {
      throw new AppError("schoolId is required", 400);
    }

    await assertSchoolOwnedByAdmin(await requireAdminScope(req), String(schoolId));

    const result = await pool.query(
      `SELECT id, school_id, student_ids, pdf_url, status, created_by, created_at
       FROM print_batches
       WHERE school_id = $1
       ORDER BY created_at DESC`,
      [schoolId]
    );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      printBatches: result.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        studentCount: Array.isArray(row.student_ids)
          ? row.student_ids.length
          : 0,
        pdfUrl: row.pdf_url,
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}
