import { Request, Response, NextFunction } from "express";
import sharp from "sharp";
import * as XLSX from "xlsx";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  fetchImageBytes,
  readBucketObject,
  STUDENT_PHOTOS_BUCKET,
  memberSignatureStoragePath,
  studentPhotoOrgId,
  studentPhotoPathFromUrl,
  studentPhotoStoragePath,
} from "../config/storage";
import { captureDayKey } from "../utils/dateUtils";
import { loadFormConfigForOrg } from "./formConfigController";
import {
  buildExportHeaders,
  studentFieldValue,
} from "../utils/studentExcel";
import {
  assertInstituteOwnedByAdmin,
  assertSchoolOwnedByAdmin,
  assertStudentOwnedByAdmin,
  requireAdminScope,
} from "../utils/adminScope";
import { loadRequiredDataContext, matchesExportScope, collectRecordFacets } from "../utils/recordStatus";

function wantsThumb(req: Request): boolean {
  return req.query.thumb === "1";
}

async function asListThumb(
  bytes: Uint8Array | Buffer,
  contentType: string | undefined,
  thumb: boolean,
  kind: "photo" | "signature"
): Promise<{ bytes: Buffer; contentType: string }> {
  const input = Buffer.from(bytes);
  if (!thumb) {
    return { bytes: input, contentType: contentType || "application/octet-stream" };
  }
  try {
    const pipeline = sharp(input, { failOn: "none" }).rotate();
    const resized =
      kind === "photo"
        ? pipeline.resize(96, 96, { fit: "cover" })
        : pipeline.resize({ width: 160, height: 48, fit: "inside" });
    const out = await resized.jpeg({ quality: 68 }).toBuffer();
    return { bytes: out, contentType: "image/jpeg" };
  } catch {
    return { bytes: input, contentType: contentType || "application/octet-stream" };
  }
}

function sanitizePhotoIdFilename(photoId: string): string {
  const cleaned = photoId
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_");
  return cleaned || "unknown";
}

function excelFileBytes(workbook: XLSX.WorkBook): Buffer {
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as
    | Buffer
    | Uint8Array;
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output);
  if (!bytes.length) {
    throw new AppError("Excel file could not be created", 500);
  }
  return bytes;
}

function sendExcel(res: Response, bytes: Buffer, filename: string): void {
  res.status(200);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(bytes.length));
  res.send(bytes);
}

async function loadOrgImageBytes(options: {
  url: string;
  orgIds: string[];
  studentId: string;
  asset: string;
}): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const orgIds = [...new Set(options.orgIds.filter(Boolean))];
  if (options.asset === "signature") {
    for (const orgId of orgIds) {
      for (const ext of ["jpg", "png"] as const) {
        const object = await readBucketObject(
          STUDENT_PHOTOS_BUCKET,
          memberSignatureStoragePath(orgId, options.studentId, ext)
        );
        if (object?.bytes?.length) return object;
      }
    }
  } else {
    const paths = new Set<string>();
    for (const orgId of orgIds) {
      const fromUrl = studentPhotoPathFromUrl(options.url, orgId, options.studentId);
      if (fromUrl) paths.add(fromUrl);
      paths.add(studentPhotoStoragePath(orgId, options.studentId));
    }
    for (const path of paths) {
      const object = await readBucketObject(STUDENT_PHOTOS_BUCKET, path);
      if (object?.bytes?.length) return object;
    }
  }
  return fetchImageBytes(options.url);
}

function extensionFromContentType(contentType: string | undefined): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  return ".jpg";
}

function rowMatchesExportExtras(
  row: Record<string, unknown>,
  captureDate: string,
  category: string,
  fieldKey: string
): boolean {
  if (category) {
    if (!fieldKey || fieldKey === "class_section") {
      if (String(row.class_section ?? "") !== category) return false;
    } else {
      const extras =
        row.extra_fields && typeof row.extra_fields === "object"
          ? (row.extra_fields as Record<string, unknown>)
          : {};
      const extraValue = String(extras[fieldKey] ?? "").trim();
      if (extraValue) {
        if (extraValue !== category) return false;
      } else if (String(row.class_section ?? "").trim() !== category) {
        return false;
      }
    }
  }
  if (!captureDate) return true;
  if (!row.photo_url) return false;
  const raw = row.photo_captured_at;
  const stamp = raw instanceof Date || typeof raw === "string" ? raw : null;
  return captureDayKey(stamp) === captureDate;
}

function createdExcelParts(raw: unknown): [string, string] {
  if (!raw) return ["", ""];
  const parsed = new Date(String(raw));
  if (Number.isNaN(parsed.getTime())) return ["", ""];
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(parsed)
    .replace(/\//g, "-");
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
  return [date, time];
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
    const category =
      typeof req.query.classSection === "string" ? req.query.classSection.trim() : "";
    const fieldKey =
      typeof req.query.fieldKey === "string" ? req.query.fieldKey.trim() : "";
    const asset =
      typeof req.query.asset === "string" ? req.query.asset.trim() : "photo";
    const photoScope =
      typeof req.query.scope === "string" ? req.query.scope.trim() : "all";
    const urlColumn = asset === "signature" ? "signature_url" : "photo_url";
    if (asset !== "signature" && photoScope === "pending") {
      throw new AppError("Pending records do not have photos to download", 404);
    }

    const whereOrg = schoolId ? "school_id = $1" : "institute_id = $1";
    const values: unknown[] = [orgId];
    const extra: string[] = [];
    if (captureDate) {
      values.push(captureDate);
      const dateExpr =
        asset === "signature"
          ? `(updated_at AT TIME ZONE 'UTC')::date`
          : `(photo_captured_at AT TIME ZONE 'Asia/Kolkata')::date`;
      extra.push(`AND ${dateExpr} = $${values.length}::date`);
    }
    if (category && fieldKey && fieldKey !== "class_section" && /^[a-zA-Z0-9_]+$/.test(fieldKey)) {
      values.push(fieldKey);
      const keyIndex = values.length;
      values.push(category);
      const valueIndex = values.length;
      extra.push(
        `AND (btrim(COALESCE(extra_fields->>$${keyIndex}, '')) = $${valueIndex} OR (btrim(COALESCE(extra_fields->>$${keyIndex}, '')) = '' AND btrim(COALESCE(class_section, '')) = $${valueIndex}))`
      );
    } else if (category) {
      values.push(category);
      extra.push(`AND class_section = $${values.length}`);
    }
    const students = await pool.query<{
      id: string;
      photo_id: string | null;
      student_name: string | null;
      school_id: string | null;
      institute_id: string | null;
      photo_url: string | null;
    }>(
      `SELECT id, photo_id, student_name, school_id, institute_id, ${urlColumn} AS photo_url
       FROM students
       WHERE ${whereOrg}
         AND ${urlColumn} IS NOT NULL
         AND btrim(${urlColumn}) <> ''
         ${extra.join("\n         ")}
       ORDER BY photo_id ASC NULLS LAST, student_name ASC`,
      values
    );

    if (students.rows.length === 0) {
      throw new AppError(
        asset === "signature"
          ? "No signatures available for this organization"
          : "No captured photos available for this organization",
        404
      );
    }

    type ZipEntry = { name: string; bytes: Buffer };
    const entries: ZipEntry[] = [];
    const usedNames = new Set<string>();
    const missing: string[] = [];

    for (const row of students.rows) {
      if (!row.photo_url) continue;
      const recordOrgId = studentPhotoOrgId(row.school_id, row.institute_id);
      const fetched = await loadOrgImageBytes({
        url: row.photo_url,
        orgIds: [recordOrgId ?? "", row.school_id ?? "", row.institute_id ?? "", orgId],
        studentId: row.id,
        asset,
      });
      if (!fetched?.bytes?.length) {
        const label = row.photo_id || row.student_name || row.id;
        missing.push(label);
        console.warn(
          `[download-photos] Skipping student=${row.id}: stored image was not readable`
        );
        continue;
      }

      const ext = extensionFromContentType(fetched.contentType);
      let base = sanitizePhotoIdFilename(row.photo_id || row.student_name || row.id);
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
        `Found ${students.rows.length} matching records, but none of the stored image files could be read.`,
        404
      );
    }
    if (missing.length > 0) {
      entries.push({
        name: "missing-files.txt",
        bytes: Buffer.from(
          `These records matched the download, but the image file could not be read:\n${missing.join("\n")}\n`,
          "utf8"
        ),
      });
    }

    const filename = `${schoolFilenameSlug(org.rows[0].name)}_${asset === "signature" ? "signatures" : "photos"}.zip`;
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
      `SELECT to_char((photo_captured_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS capture_date,
              COUNT(*)::int AS photo_count
       FROM students
       WHERE ${whereOrg}
         AND photo_url IS NOT NULL
         AND btrim(photo_url) <> ''
         AND photo_captured_at IS NOT NULL
       GROUP BY 1
       ORDER BY 1`,
      [orgId]
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.capture_date) counts[row.capture_date] = row.photo_count;
    }
    const facetRows = await pool.query<{
      class_section: string | null;
      extra_fields: unknown;
      field_labels: unknown;
      photo_url: string | null;
      photo_captured_at: string | null;
      updated_at: string | null;
    }>(
      `SELECT class_section, extra_fields, field_labels, photo_url,
              photo_captured_at, updated_at
       FROM students
       WHERE ${whereOrg}`,
      [orgId]
    );
    const facets = collectRecordFacets(facetRows.rows);
    const signatureDates = await pool.query<{ capture_date: string; photo_count: number }>(
      `SELECT to_char((updated_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS capture_date,
              COUNT(*)::int AS photo_count
       FROM students
       WHERE ${whereOrg}
         AND signature_url IS NOT NULL
         AND btrim(signature_url) <> ''
       GROUP BY 1
       ORDER BY 1`,
      [orgId]
    );
    const signatureCounts: Record<string, number> = {};
    for (const row of signatureDates.rows) {
      if (row.capture_date) signatureCounts[row.capture_date] = row.photo_count;
    }
    res.status(200).json({
      status: "ok",
      counts,
      categories: facets.classes,
      classes: facets.classes,
      groups: facets.groups,
      designations: facets.designations,
      departments: facets.departments,
      signatureCounts,
    });
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
    if (!["all", "pending", "captured", "uncaptured", "captured-pending-data", "uncaptured-pending-data", "pending-data"].includes(exportScope)) {
      throw new AppError("scope is not supported", 400);
    }

    const school = await pool.query<{ name: string }>(
      `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    if (!school.rows[0]) {
      throw new AppError("School not found", 404);
    }

    const captureDate =
      typeof req.query.date === "string" ? req.query.date.trim() : "";
    const category =
      typeof req.query.classSection === "string" ? req.query.classSection.trim() : "";
    const fieldKey =
      typeof req.query.fieldKey === "string" ? req.query.fieldKey.trim() : "";
    const dataCtx = await loadRequiredDataContext(schoolId, null);
    const result = await pool.query<Record<string, unknown>>(
      `SELECT photo_id, class_section, student_name, parent_name, parent_phone,
              address, roll_no, dob::text AS dob, gender, blood_group,
              custom_1, custom_2, custom_3, extra_fields, field_labels, photo_url,
              photo_captured_at::text AS photo_captured_at, created_at::text AS created_at, status
       FROM students
       WHERE school_id = $1
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      [schoolId]
    );
    const scopedRows = result.rows.filter(
      (row) =>
        matchesExportScope(row, exportScope, dataCtx) &&
        rowMatchesExportExtras(row, captureDate, category, fieldKey)
    );
    if (scopedRows.length === 0) {
      throw new AppError("No records match this download.", 404);
    }

    const formFields = await loadFormConfigForOrg({ schoolId });
    const exportColumns = buildExportHeaders(formFields);
    const header = [...exportColumns.map((c) => c.label), "Created Date", "Created Time"];

    const rows = scopedRows.map((s) => [
      ...exportColumns.map((col) =>
        studentFieldValue(s as Record<string, string | null>, col.key, col.label)
      ),
      ...createdExcelParts(String(s.photo_url ?? "").trim() ? s.photo_captured_at : null),
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Students");
    const bytes = excelFileBytes(workbook);
    const filename = `${schoolFilenameSlug(school.rows[0].name)}_students_${exportScope}.xlsx`;
    sendExcel(res, bytes, filename);
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
    if (!["all", "pending", "captured", "uncaptured", "captured-pending-data", "uncaptured-pending-data", "pending-data"].includes(exportScope)) {
      throw new AppError("scope is not supported", 400);
    }

    const institute = await pool.query<{ name: string }>(
      `SELECT name FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    if (!institute.rows[0]) {
      throw new AppError("Institute not found", 404);
    }

    const captureDate =
      typeof req.query.date === "string" ? req.query.date.trim() : "";
    const category =
      typeof req.query.classSection === "string" ? req.query.classSection.trim() : "";
    const fieldKey =
      typeof req.query.fieldKey === "string" ? req.query.fieldKey.trim() : "";
    const dataCtx = await loadRequiredDataContext(null, instituteId);
    const result = await pool.query<Record<string, unknown>>(
      `SELECT photo_id, class_section, student_name, parent_name, parent_phone,
              address, roll_no, dob::text AS dob, gender, blood_group,
              custom_1, custom_2, custom_3, extra_fields, field_labels, photo_url,
              photo_captured_at::text AS photo_captured_at, created_at::text AS created_at, status
       FROM students
       WHERE institute_id = $1
       ORDER BY class_section ASC, roll_no ASC NULLS LAST, student_name ASC`,
      [instituteId]
    );
    const scopedRows = result.rows.filter(
      (row) =>
        matchesExportScope(row, exportScope, dataCtx) &&
        rowMatchesExportExtras(row, captureDate, category, fieldKey)
    );
    if (scopedRows.length === 0) {
      throw new AppError("No records match this download.", 404);
    }

    const formFields = await loadFormConfigForOrg({ instituteId });
    const exportColumns = buildExportHeaders(formFields);
    const header = [...exportColumns.map((c) => c.label), "Created Date", "Created Time"];
    const rows = scopedRows.map((s) => [
      ...exportColumns.map((col) =>
        studentFieldValue(s as Record<string, string | null>, col.key, col.label)
      ),
      ...createdExcelParts(String(s.photo_url ?? "").trim() ? s.photo_captured_at : null),
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Members");
    const bytes = excelFileBytes(workbook);
    const filename = `${schoolFilenameSlug(institute.rows[0].name)}_members_${exportScope}.xlsx`;
    sendExcel(res, bytes, filename);
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
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);
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

    const image = await asListThumb(
      fetched.bytes,
      fetched.contentType,
      wantsThumb(req),
      "photo"
    );
    const ext = wantsThumb(req) ? ".jpg" : extensionFromContentType(image.contentType);
    const base =
      sanitizePhotoIdFilename(
        student.photo_id || student.student_name || studentId
      ) || "photo";
    const filename = `${base}${ext}`;

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.status(200).send(image.bytes);
  } catch (error) {
    next(error);
  }
}

/** GET /admin/students/:studentId/signature */
export async function downloadStudentSignature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const studentId =
      typeof req.params.studentId === "string" ? req.params.studentId.trim() : "";
    if (!studentId) throw new AppError("Student id is required", 400);
    const result = await pool.query<{
      photo_id: string | null;
      signature_url: string | null;
      school_id: string | null;
      institute_id: string | null;
    }>(
      `SELECT photo_id, signature_url, school_id, institute_id FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = result.rows[0];
    if (!student) throw new AppError("Student not found", 404);
    await assertStudentOwnedByAdmin(await requireAdminScope(req), student);
    if (!student.signature_url) throw new AppError("No signature uploaded for this record", 404);
    const orgId = studentPhotoOrgId(student.school_id, student.institute_id);
    let fetched: { bytes: Uint8Array | Buffer; contentType?: string } | null = null;
    if (orgId) {
      for (const ext of ["jpg", "png"] as const) {
        const object = await readBucketObject(
          STUDENT_PHOTOS_BUCKET,
          memberSignatureStoragePath(orgId, studentId, ext)
        );
        if (object?.bytes?.length) {
          fetched = object;
          break;
        }
      }
    }
    if (!fetched?.bytes?.length) fetched = await fetchImageBytes(student.signature_url);
    if (!fetched?.bytes?.length) throw new AppError("Could not download signature from storage", 502);
    const image = await asListThumb(
      fetched.bytes,
      fetched.contentType,
      wantsThumb(req),
      "signature"
    );
    const ext = wantsThumb(req) ? ".jpg" : extensionFromContentType(image.contentType);
    const base = sanitizePhotoIdFilename(student.photo_id || studentId);
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("Content-Disposition", `inline; filename="${base}${ext}"`);
    res.status(200).send(image.bytes);
  } catch (error) {
    next(error);
  }
}
