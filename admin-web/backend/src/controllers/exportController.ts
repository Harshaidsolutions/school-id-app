import { Request, Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  fetchImageBytes,
  readBucketObject,
  STUDENT_PHOTOS_BUCKET,
  studentPhotoOrgId,
  studentPhotoPathFromUrl,
  studentPhotoStoragePath,
} from "../config/storage";
import { loadFormConfigForOrg } from "./formConfigController";
import {
  buildExportHeaders,
  studentFieldValue,
} from "../utils/studentExcel";
import {
  assertInstituteOwnedByAdmin,
  assertSchoolOwnedByAdmin,
  requireAdminScope,
} from "../utils/adminScope";
import { loadRequiredDataContext, matchesExportScope } from "../utils/recordStatus";

function sanitizePhotoIdFilename(photoId: string): string {
  const cleaned = photoId
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_");
  return cleaned || "unknown";
}

function extensionFromContentType(contentType: string | undefined): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  return ".jpg";
}

function schoolFilenameSlug(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "school"
  );
}

/**
 * GET /admin/schools/:schoolId/download-photos
 * GET /admin/institutes/:instituteId/download-photos
 * ZIP of captured/printed student photos, each named by photo_id.
 */
async function downloadOrgPhotosZip(
  req: Request,
  res: Response,
  next: NextFunction,
  options: { schoolId?: string; instituteId?: string }
): Promise<void> {
  try {
    const { schoolId, instituteId } = options;
    const orgId = schoolId ?? instituteId;
    if (!orgId) throw new AppError("Organization id is required", 400);
    const scope = await requireAdminScope(req);
    if (schoolId) await assertSchoolOwnedByAdmin(scope, schoolId);
    if (instituteId) await assertInstituteOwnedByAdmin(scope, instituteId);

    const org = schoolId
      ? await pool.query<{ name: string }>(
          `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
          [schoolId]
        )
      : await pool.query<{ name: string }>(
          `SELECT name FROM institutes WHERE id = $1 LIMIT 1`,
          [instituteId]
        );
    if (!org.rows[0]) {
      throw new AppError(schoolId ? "School not found" : "Institute not found", 404);
    }

    const captureDate =
      typeof req.query.date === "string" ? req.query.date.trim() : "";

    const whereOrg = schoolId ? "school_id = $1" : "institute_id = $1";
    const students = await pool.query<{
      photo_id: string | null;
      photo_url: string | null;
    }>(
      captureDate
        ? `SELECT photo_id, photo_url
           FROM students
           WHERE ${whereOrg}
             AND photo_url IS NOT NULL
             AND status IN ('captured', 'printed')
             AND COALESCE(
                   (photo_captured_at AT TIME ZONE 'UTC')::date,
                   (updated_at AT TIME ZONE 'UTC')::date
                 ) = $2::date
           ORDER BY photo_id ASC NULLS LAST`
        : `SELECT photo_id, photo_url
           FROM students
           WHERE ${whereOrg}
             AND photo_url IS NOT NULL
             AND status IN ('captured', 'printed')
           ORDER BY photo_id ASC NULLS LAST`,
      captureDate ? [orgId, captureDate] : [orgId]
    );

    if (students.rows.length === 0) {
      throw new AppError(
        "No captured photos available for this organization",
        404
      );
    }

    type ZipEntry = { name: string; bytes: Buffer };
    const entries: ZipEntry[] = [];
    const usedNames = new Set<string>();

    for (const row of students.rows) {
      if (!row.photo_url || !row.photo_id) continue;

      const fetched = await fetchImageBytes(row.photo_url);
      if (!fetched?.bytes?.length) {
        console.warn(
          `[download-photos] Skipping photo_id=${row.photo_id}: empty fetch`
        );
        continue;
      }

      const ext = extensionFromContentType(fetched.contentType);
      let base = sanitizePhotoIdFilename(row.photo_id);
      if (/\.(jpe?g|png|webp)$/i.test(base)) {
        base = base.replace(/\.(jpe?g|png|webp)$/i, "");
      }
      let entryName = `${base}${ext}`;
      let n = 2;
      while (usedNames.has(entryName.toLowerCase())) {
        entryName = `${base}_${n}${ext}`;
        n += 1;
      }
      usedNames.add(entryName.toLowerCase());
      entries.push({ name: entryName, bytes: Buffer.from(fetched.bytes) });
    }

    if (entries.length === 0) {
      throw new AppError(
        "Could not download any photo files from storage",
        404
      );
    }

    const filename = `${schoolFilenameSlug(org.rows[0].name)}_photos.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    const { ZipArchive } = await import("archiver");
    const archive = new ZipArchive({ store: true });
    archive.on("error", (err: Error) => {
      console.error("[download-photos] archive error:", err);
      if (!res.headersSent) {
        next(err);
      } else {
        res.end();
      }
    });
    archive.pipe(res);

    for (const entry of entries) {
      archive.append(entry.bytes, { name: entry.name });
    }

    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      next(error);
    } else {
      console.error("[download-photos] Error after headers sent:", error);
      res.end();
    }
  }
}

export async function downloadSchoolPhotosZip(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const schoolIdRaw = req.params.schoolId;
  const schoolId =
    typeof schoolIdRaw === "string" ? schoolIdRaw.trim() : "";
  return downloadOrgPhotosZip(req, res, next, { schoolId });
}

export async function downloadInstitutePhotosZip(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const instituteIdRaw = req.params.instituteId;
  const instituteId =
    typeof instituteIdRaw === "string" ? instituteIdRaw.trim() : "";
  return downloadOrgPhotosZip(req, res, next, { instituteId });
}

async function listPhotoCaptureCounts(
  req: Request,
  res: Response,
  next: NextFunction,
  options: { schoolId?: string; instituteId?: string }
): Promise<void> {
  try {
    const { schoolId, instituteId } = options;
    const orgId = schoolId ?? instituteId;
    if (!orgId) throw new AppError("Organization id is required", 400);
    const scope = await requireAdminScope(req);
    if (schoolId) await assertSchoolOwnedByAdmin(scope, schoolId);
    if (instituteId) await assertInstituteOwnedByAdmin(scope, instituteId);
    const whereOrg = schoolId ? "school_id = $1" : "institute_id = $1";
    const result = await pool.query<{ capture_date: string; photo_count: number }>(
      `SELECT to_char(
                COALESCE(
                  (photo_captured_at AT TIME ZONE 'UTC')::date,
                  (updated_at AT TIME ZONE 'UTC')::date
                ),
                'YYYY-MM-DD'
              ) AS capture_date,
              COUNT(*)::int AS photo_count
       FROM students
       WHERE ${whereOrg}
         AND photo_url IS NOT NULL
         AND status IN ('captured', 'printed')
       GROUP BY 1
       ORDER BY 1`,
      [orgId]
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.capture_date) counts[row.capture_date] = row.photo_count;
    }
    res.status(200).json({ status: "ok", counts });
  } catch (error) {
    next(error);
  }
}

export async function listSchoolPhotoCaptureCounts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const schoolId =
    typeof req.params.schoolId === "string" ? req.params.schoolId.trim() : "";
  return listPhotoCaptureCounts(req, res, next, { schoolId });
}

export async function listInstitutePhotoCaptureCounts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const instituteId =
    typeof req.params.instituteId === "string"
      ? req.params.instituteId.trim()
      : "";
  return listPhotoCaptureCounts(req, res, next, { instituteId });
}

/**
 * GET /admin/students/:schoolId/export
 * Live Excel export: Photo_Id, Class_Section, Name, Parent, Phone, Address,
 * Roll No, Status (real-time from DB).
 */
export async function exportStudentsExcel(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolIdRaw = req.params.schoolId;
    const schoolId =
      typeof schoolIdRaw === "string" ? schoolIdRaw.trim() : "";
    if (!schoolId) {
      throw new AppError("schoolId is required", 400);
    }
    const scope = await requireAdminScope(req);
    await assertSchoolOwnedByAdmin(scope, schoolId);
    const exportScope =
      typeof req.query.scope === "string" ? req.query.scope.trim() : "all";
    if (!["all", "pending", "captured"].includes(exportScope)) {
      throw new AppError("scope must be all, pending, or captured", 400);
    }

    const school = await pool.query<{ name: string }>(
      `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    if (!school.rows[0]) {
      throw new AppError("School not found", 404);
    }

    const dataCtx = await loadRequiredDataContext(schoolId, null);
    const result = await pool.query<Record<string, string | null>>(
      `SELECT photo_id, class_section, student_name, parent_name, parent_phone,
              address, roll_no, dob::text AS dob, gender, blood_group,
              custom_1, custom_2, custom_3, extra_fields, field_labels, photo_url, status
       FROM students
       WHERE school_id = $1
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      [schoolId]
    );
    const scopedRows = result.rows.filter((row) =>
      matchesExportScope(row as unknown as Record<string, unknown>, exportScope, dataCtx)
    );

    const formFields = await loadFormConfigForOrg({ schoolId });
    const exportColumns = buildExportHeaders(formFields);
    const header = exportColumns.map((c) => c.label);

    const rows = scopedRows.map((s) =>
      exportColumns.map((col) => studentFieldValue(s, col.key, col.label))
    );

    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Students");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    const filename = `${schoolFilenameSlug(school.rows[0].name)}_students_${exportScope}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /admin/institutes/:instituteId/export-members
 * Excel export for institute members using form config labels.
 */
export async function exportInstituteMembersExcel(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const instituteIdRaw = req.params.instituteId;
    const instituteId =
      typeof instituteIdRaw === "string" ? instituteIdRaw.trim() : "";
    if (!instituteId) {
      throw new AppError("instituteId is required", 400);
    }
    const scope = await requireAdminScope(req);
    await assertInstituteOwnedByAdmin(scope, instituteId);
    const exportScope =
      typeof req.query.scope === "string" ? req.query.scope.trim() : "all";
    if (!["all", "pending", "captured"].includes(exportScope)) {
      throw new AppError("scope must be all, pending, or captured", 400);
    }

    const institute = await pool.query<{ name: string }>(
      `SELECT name FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    if (!institute.rows[0]) {
      throw new AppError("Institute not found", 404);
    }

    const dataCtx = await loadRequiredDataContext(null, instituteId);
    const result = await pool.query<Record<string, string | null>>(
      `SELECT photo_id, class_section, student_name, parent_name, parent_phone,
              address, roll_no, dob::text AS dob, gender, blood_group,
              custom_1, custom_2, custom_3, extra_fields, field_labels, photo_url, status
       FROM students
       WHERE institute_id = $1
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      [instituteId]
    );
    const scopedRows = result.rows.filter((row) =>
      matchesExportScope(row as unknown as Record<string, unknown>, exportScope, dataCtx)
    );

    const formFields = await loadFormConfigForOrg({ instituteId });
    const exportColumns = buildExportHeaders(formFields);
    const header = exportColumns.map((c) => c.label);
    const rows = scopedRows.map((s) =>
      exportColumns.map((col) => studentFieldValue(s, col.key, col.label))
    );

    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Members");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    const filename = `${schoolFilenameSlug(institute.rows[0].name)}_members_${exportScope}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /admin/students/:studentId/photo
 * Download one student's captured photo file.
 */
export async function downloadStudentPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const studentId =
      typeof req.params.studentId === "string"
        ? req.params.studentId.trim()
        : "";
    if (!studentId) {
      throw new AppError("Student id is required", 400);
    }

    const result = await pool.query<{
      student_name: string | null;
      photo_id: string | null;
      photo_url: string | null;
      school_id: string | null;
      institute_id: string | null;
    }>(
      `SELECT student_name, photo_id, photo_url, school_id, institute_id
       FROM students
       WHERE id = $1
       LIMIT 1`,
      [studentId]
    );

    const student = result.rows[0];
    if (!student) {
      throw new AppError("Student not found", 404);
    }
    if (!student.photo_url) {
      throw new AppError("No photo captured for this student", 404);
    }

    const orgId = studentPhotoOrgId(student.school_id, student.institute_id);
    const storedPath = studentPhotoPathFromUrl(student.photo_url, orgId, studentId);
    const paths = new Set<string>();
    if (storedPath) paths.add(storedPath);
    if (student.school_id) paths.add(studentPhotoStoragePath(student.school_id, studentId));
    if (student.institute_id) {
      paths.add(studentPhotoStoragePath(student.institute_id, studentId));
    }
    let fetched: { bytes: Uint8Array | Buffer; contentType?: string } | null = null;
    for (const path of paths) {
      const object = await readBucketObject(STUDENT_PHOTOS_BUCKET, path);
      if (object?.bytes?.length) {
        fetched = object;
        break;
      }
    }
    if (!fetched?.bytes?.length) {
      fetched = await fetchImageBytes(student.photo_url);
    }
    if (!fetched?.bytes?.length) {
      throw new AppError("Could not download photo from storage", 502);
    }

    const ext = extensionFromContentType(fetched.contentType);
    const base =
      sanitizePhotoIdFilename(
        student.photo_id || student.student_name || studentId
      ) || "photo";
    const filename = `${base}${ext}`;

    res.setHeader(
      "Content-Type",
      fetched.contentType || "application/octet-stream"
    );
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.status(200).send(Buffer.from(fetched.bytes));
  } catch (error) {
    next(error);
  }
}
