import { randomBytes, randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import sharp from "sharp";
import type { PoolClient } from "pg";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { consumeAttempt } from "../middleware/attemptLimit";
import {
  requireAdminScope,
  assertSchoolOwnedByAdmin,
} from "../utils/adminScope";
import { loadFormConfigForOrg } from "./formConfigController";
import { FormFieldConfig } from "../constants/formFields";
import {
  inferSemanticKey,
  normalizeHeaderForMatch,
  deriveCanonicalValuesFromExtraFields,
} from "../utils/excelSchema";
import { allocateReusableAddSerial } from "../utils/addSerial";
import {
  uploadStudentPhotoToStorage,
  uploadMemberSignatureToStorage,
  deleteStudentPhotoFromStorage,
  deleteFromBucket,
  memberSignatureStoragePath,
  STUDENT_PHOTOS_BUCKET,
} from "../config/storage";
import { routeParam } from "../utils/routeParams";

const origin = () =>
  (process.env.PUBLIC_WEB_ORIGIN || "https://myschoolidcard.in").replace(
    /\/$/,
    "",
  );
export function parentFormFields(config: FormFieldConfig[]) {
  const enabled = config.filter((f) => f.enabled);
  const name = enabled.find(
    (f) =>
      f.key === "student_name" ||
      inferSemanticKey(normalizeHeaderForMatch(f.label)) === "student_name",
  );
  if (!name)
    throw new AppError(
      "Enable Student Name in Form Setup before sharing the parent form.",
      400,
    );
  const classField = enabled.find(
    (f) =>
      f.key === "class_section" ||
      inferSemanticKey(normalizeHeaderForMatch(f.label)) === "class_section",
  );
  if (!classField)
    throw new AppError(
      "Enable Class in Form Setup before sharing the parent form.",
      400,
    );
  // PHOTO/PHOTO_ID from Excel is a generated identifier, never parent-entered data.
  const fields = enabled
    .filter(
      (f) =>
        f.key !== "photo_id" &&
        inferSemanticKey(normalizeHeaderForMatch(f.label)) !== "photo_id",
    )
    .map((f) => ({
      id: f.key,
      fieldName: f.label,
      fieldType: f.key === "signature_upload" ? "photo" : "text",
      required: f.key === name.key || f.key === classField.key,
    }));
  return {
    fields: [
      {
        id: "student_photo",
        fieldName: "Student Photo",
        fieldType: "photo",
        required: true,
      },
      ...fields,
    ],
    nameKey: name.key,
    classKey: classField.key,
  };
}
export async function schoolParentClasses(schoolId: string): Promise<string[]> {
  const result = await pool.query<{ parent_form_classes: string[] | null }>(
    "SELECT parent_form_classes FROM schools WHERE id=$1",
    [schoolId],
  );
  if (Array.isArray(result.rows[0]?.parent_form_classes))
    return result.rows[0].parent_form_classes;
  const classes = await pool.query<{ class_section: string }>(
    "SELECT DISTINCT class_section FROM students WHERE school_id=$1 AND NULLIF(TRIM(class_section),'') IS NOT NULL AND class_section <> 'UNKNOWN' ORDER BY class_section",
    [schoolId],
  );
  return classes.rows.map((row) => row.class_section);
}
function parseClasses(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((v) => typeof v !== "string" || v.trim().length > 100)
  )
    throw new AppError(
      "Enter up to 100 class choices, each under 100 characters.",
      400,
    );
  const classes = [
    ...new Set(value.map((v) => String(v).trim()).filter(Boolean)),
  ];
  if (!classes.length)
    throw new AppError(
      "Add at least one class choice before sharing the link.",
      400,
    );
  return classes;
}
async function schoolForToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token))
    throw new AppError("This school form is not available.", 404);
  const result = await pool.query<{ id: string; name: string }>(
    `SELECT id,name FROM schools WHERE parent_form_token=$1 AND COALESCE(is_active,true)=true`,
    [token],
  );
  if (!result.rows[0])
    throw new AppError("This school form is not available.", 404);
  return result.rows[0];
}
export async function getSchoolParentLink(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const schoolId =
      req.user?.role === "teacher"
        ? req.user.schoolId
        : routeParam(req.params.id);
    if (!schoolId) throw new AppError("School is required", 400);
    if (req.user?.role !== "teacher")
      await assertSchoolOwnedByAdmin(await requireAdminScope(req), schoolId);
    const school = await pool.query<{ parent_form_token: string | null }>(
      `SELECT parent_form_token FROM schools WHERE id=$1 AND COALESCE(is_active,true)=true`,
      [schoolId],
    );
    if (!school.rows[0]) throw new AppError("School not found", 404);
    const token = school.rows[0].parent_form_token;
    res.json({
      link: token ? `${origin()}/school-form/${token}` : null,
      classes: await schoolParentClasses(schoolId),
    });
  } catch (e) {
    next(e);
  }
}
export async function createSchoolParentLink(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = routeParam(req.params.id);
    await assertSchoolOwnedByAdmin(await requireAdminScope(req), id);
    parentFormFields(await loadFormConfigForOrg({ schoolId: id }));
    const classes = parseClasses(
      req.body?.classes ?? (await schoolParentClasses(id)),
    );
    const result = await pool.query<{ parent_form_token: string }>(
      `UPDATE schools SET parent_form_token=COALESCE(parent_form_token,$2),parent_form_classes=$3::jsonb WHERE id=$1 AND COALESCE(is_active,true)=true RETURNING parent_form_token`,
      [id, randomBytes(24).toString("hex"), JSON.stringify(classes)],
    );
    if (!result.rows[0]) throw new AppError("Active school not found", 404);
    res.json({
      link: `${origin()}/school-form/${result.rows[0].parent_form_token}`,
      classes,
    });
  } catch (e) {
    next(e);
  }
}
export async function getSchoolParentForm(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const school = await schoolForToken(routeParam(req.params.token));
    const { fields, classKey } = parentFormFields(
      await loadFormConfigForOrg({ schoolId: school.id }),
    );
    const classes = await schoolParentClasses(school.id);
    res.json({
      organizationName: school.name,
      fields: fields.map((f) =>
        f.id === classKey ? { ...f, fieldType: "select", options: classes } : f,
      ),
    });
  } catch (e) {
    next(e);
  }
}
export function limitParentSubmission(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    consumeAttempt(`parent-form:${req.ip}:${req.params.token}`, 20);
    next();
  } catch (e) {
    res.setHeader("Retry-After", "900");
    next(e);
  }
}
export async function submitSchoolParentForm(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let client: PoolClient | undefined;
  let photoOrg: string | null = null,
    signaturePath: string | null = null;
  const id = randomUUID();
  let committed = false;
  try {
    const school = await schoolForToken(routeParam(req.params.token));
    const config = await loadFormConfigForOrg({ schoolId: school.id });
    const { fields, nameKey, classKey } = parentFormFields(config);
    const files = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files ?? {}).flat();
    const photo = files.find((f) => f.fieldname === "student_photo");
    if (!photo) throw new AppError("Student Photo is required", 400);
    const extra: Record<string, string | null> = {};
    for (const f of fields) {
      if (f.fieldType === "photo") continue;
      const value = String(req.body[f.id] ?? "").trim();
      if (value.length > 2000)
        throw new AppError(`${f.fieldName} is too long`, 400);
      if (f.required && !value)
        throw new AppError(`${f.fieldName} is required`, 400);
      extra[f.id] = value || null;
    }
    const classes = await schoolParentClasses(school.id);
    if (!classes.includes(extra[classKey] ?? ""))
      throw new AppError("Choose a class from the available options.", 400);
    const signature = fields.some((f) => f.id === "signature_upload")
      ? files.find((f) => f.fieldname === "signature_upload")
      : undefined;
    for (const file of [photo, signature].filter(
      Boolean,
    ) as Express.Multer.File[]) {
      try {
        const meta = await sharp(file.buffer, {
          limitInputPixels: 40000000,
        }).metadata();
        if (!["jpeg", "png"].includes(meta.format ?? "")) throw Error("type");
      } catch {
        throw new AppError("Choose a valid JPG or PNG image.", 400);
      }
    }
    const canonical = deriveCanonicalValuesFromExtraFields(
      config.map((f, index) => ({
        key: f.key,
        label: f.label,
        colIndex: index,
      })),
      extra,
    );
    client = await pool.connect();
    await client.query("BEGIN");
    const number = await allocateReusableAddSerial(client, {
      schoolId: school.id,
    });
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `record:${school.id}`,
    ]);
    const expected = fields
      .filter((f) => f.fieldType === "text")
      .map((f) => ({
        key: f.id,
        value: extra[f.id] ?? "",
        canonical:
          inferSemanticKey(normalizeHeaderForMatch(f.fieldName)) ?? f.id,
      }));
    const duplicate = await client.query(
      `SELECT s.id FROM students s WHERE s.school_id=$1 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements($2::jsonb) e WHERE record_normalize(COALESCE(NULLIF(s.extra_fields->>(e->>'key'),''),to_jsonb(s)->>(e->>'canonical'),'')) <> record_normalize(e->>'value')
    ) LIMIT 1`,
      [school.id, JSON.stringify(expected)],
    );
    if (duplicate.rows.length)
      throw new AppError("Data already exists. Please contact admin.", 409);
    for (const field of config.filter(
      (f) =>
        f.enabled &&
        (f.key === "photo_id" ||
          inferSemanticKey(normalizeHeaderForMatch(f.label)) === "photo_id"),
    ))
      extra[field.key] = number;
    const labels = Object.fromEntries(
      config.filter((f) => f.enabled).map((f) => [f.key, f.label]),
    );
    // Insert before uploading; the existing scoped duplicate trigger checks all entered data.
    await client.query(
      `INSERT INTO students (id,school_id,photo_id,student_name,class_section,parent_name,parent_phone,address,roll_no,gender,blood_group,dob,extra_fields,field_labels,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,'pending')`,
      [
        id,
        school.id,
        number,
        extra[nameKey],
        extra[classKey],
        canonical.parent_name || null,
        canonical.parent_phone || null,
        canonical.address || null,
        canonical.roll_no || null,
        canonical.gender || null,
        canonical.blood_group || null,
        null,
        JSON.stringify(extra),
        JSON.stringify(labels),
      ],
    );
    photoOrg = school.id;
    const url = await uploadStudentPhotoToStorage(school.id, id, photo);
    let signatureUrl: string | null = null;
    if (signature) {
      signaturePath = memberSignatureStoragePath(
        school.id,
        id,
        signature.mimetype === "image/png" ? "png" : "jpg",
      );
      signatureUrl = await uploadMemberSignatureToStorage(
        school.id,
        id,
        signature,
      );
    }
    await client.query(
      `UPDATE students SET photo_url=$2,signature_url=$3,status='captured',photo_captured_at=NOW(),photo_cropped=false,updated_at=NOW() WHERE id=$1`,
      [id, url, signatureUrl],
    );
    await client.query("COMMIT");
    committed = true;
    res.status(201).json({ status: "ok", photoNumber: number });
  } catch (e) {
    if (!committed) {
      await client?.query("ROLLBACK").catch(() => {});
      if (photoOrg)
        await deleteStudentPhotoFromStorage(photoOrg, id).catch(() => {});
      if (signaturePath)
        await deleteFromBucket(STUDENT_PHOTOS_BUCKET, signaturePath).catch(
          () => {},
        );
    }
    next(e);
  } finally {
    client?.release();
  }
}
