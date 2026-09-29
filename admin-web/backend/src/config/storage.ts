import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AppError } from "../middleware/errorHandler";

/** Logical folders inside the single S3 bucket (one prefix per asset type). */
export const STUDENT_PHOTOS_BUCKET = "student-photos";
export const PRINT_PDFS_BUCKET = "print-pdfs";
export const TEMPLATES_BUCKET = "templates";
export const SCHOOL_ASSETS_BUCKET = "school-assets";
export const CARD_PREVIEWS_BUCKET = "card-previews";
export const CATALOG_BUCKET = "catalog";

let s3Client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(`${name} must be configured`, 500);
  }
  return value;
}

function getBucketName(): string {
  return requireEnv("S3_BUCKET_NAME");
}

function getRegion(): string {
  return requireEnv("AWS_REGION");
}

export function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  // Credentials: explicit env keys, or default provider chain (IAM role on EC2/ECS/Railway with OIDC, etc.)
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  s3Client = new S3Client({
    region: getRegion(),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });

  return s3Client;
}

function objectKey(folder: string, path: string): string {
  const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanFolder}/${cleanPath}`;
}

/**
 * Public HTTPS URL for an object.
 * Override with S3_PUBLIC_BASE_URL when using CloudFront (no trailing slash).
 */
export function publicObjectUrl(folder: string, path: string): string {
  const key = objectKey(folder, path);
  const base = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (base) {
    return `${base}/${key}`;
  }
  const bucket = getBucketName();
  const region = getRegion();
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function studentPhotoStoragePath(
  schoolId: string,
  studentId: string
): string {
  return `${schoolId}/${studentId}.jpg`;
}

export function memberSignatureStoragePath(
  orgId: string,
  studentId: string,
  ext: "jpg" | "png"
): string {
  return `${orgId}/signatures/${studentId}.${ext}`;
}

export async function uploadMemberSignatureToStorage(
  orgId: string,
  studentId: string,
  file: Express.Multer.File
): Promise<string> {
  const ext = file.mimetype === "image/png" ? "png" : "jpg";
  return uploadBufferToBucket(
    STUDENT_PHOTOS_BUCKET,
    memberSignatureStoragePath(orgId, studentId, ext),
    file.buffer,
    file.mimetype
  );
}

export function studentPhotoOrgId(
  schoolId: string | null | undefined,
  instituteId: string | null | undefined
): string | null {
  return schoolId ?? instituteId ?? null;
}

export async function uploadBufferToBucket(
  folder: string,
  path: string,
  buffer: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucketName();
  const key = objectKey(folder, path);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000",
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`S3 upload error (${bucket}/${key}):`, error);
    throw new AppError(`Upload failed: ${message}`, 500);
  }

  return publicObjectUrl(folder, path);
}

export async function uploadStudentPhotoToStorage(
  schoolId: string,
  studentId: string,
  file: Express.Multer.File
): Promise<string> {
  return uploadBufferToBucket(
    STUDENT_PHOTOS_BUCKET,
    studentPhotoStoragePath(schoolId, studentId),
    file.buffer,
    file.mimetype
  );
}

export async function deleteStudentPhotoFromStorage(
  orgId: string,
  studentId: string
): Promise<void> {
  await deleteFromBucket(
    STUDENT_PHOTOS_BUCKET,
    studentPhotoStoragePath(orgId, studentId)
  );
}

export async function deleteFromBucket(
  folder: string,
  path: string
): Promise<void> {
  const client = getS3Client();
  const bucket = getBucketName();
  const key = objectKey(folder, path);

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`S3 delete error (${bucket}/${key}):`, error);
    throw new AppError(`Delete failed: ${message}`, 500);
  }
}

/**
 * Resolve object path inside the student-photos folder from a stored public URL.
 * Supports S3 virtual-hosted URLs and optional CloudFront base.
 * Also parses legacy public URLs that embed /student-photos/ in the path.
 */
export function studentPhotoPathFromUrl(
  url: string | null,
  schoolId: string | null,
  studentId: string
): string | null {
  if (url) {
    const marker = `/${STUDENT_PHOTOS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const rest = url.slice(idx + marker.length).split("?")[0];
      if (rest) {
        return decodeURIComponent(rest);
      }
    }
  }

  if (schoolId) {
    return studentPhotoStoragePath(schoolId, studentId);
  }

  return null;
}

export async function deleteStudentPhotoByPath(path: string): Promise<void> {
  await deleteFromBucket(STUDENT_PHOTOS_BUCKET, path);
}

export async function fetchImageBytes(
  url: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Failed to fetch image (${res.status}): ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    return { bytes: new Uint8Array(arrayBuffer), contentType };
  } catch (error) {
    console.warn(`Error fetching image: ${url}`, error);
    return null;
  }
}

export async function uploadPrintPdfToStorage(
  schoolId: string,
  printBatchId: string,
  pdfBytes: Uint8Array
): Promise<string> {
  return uploadBufferToBucket(
    PRINT_PDFS_BUCKET,
    `${schoolId}/${printBatchId}.pdf`,
    pdfBytes,
    "application/pdf"
  );
}

export async function uploadTemplateImage(
  templateId: string,
  file: Express.Multer.File
): Promise<string> {
  const name = file.originalname.toLowerCase();
  const ext =
    name.endsWith(".pdf") || file.mimetype === "application/pdf"
      ? "pdf"
      : file.mimetype === "image/png" || name.endsWith(".png")
        ? "png"
        : "jpg";
  return uploadBufferToBucket(
    TEMPLATES_BUCKET,
    `global/${templateId}.${ext}`,
    file.buffer,
    file.mimetype
  );
}

function catalogExt(file: Express.Multer.File): string {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (name.endsWith(".png") || mime === "image/png") return "png";
  if (name.endsWith(".mp4") || mime === "video/mp4") return "mp4";
  if (name.endsWith(".webm") || mime === "video/webm") return "webm";
  if (name.endsWith(".mov") || mime === "video/quicktime") return "mov";
  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    mime === "image/jpeg"
  ) {
    return "jpg";
  }
  return "jpg";
}

export async function uploadCatalogFile(
  kind: string,
  itemId: string,
  file: Express.Multer.File
): Promise<string> {
  const ext = catalogExt(file);
  return uploadBufferToBucket(
    CATALOG_BUCKET,
    `${kind}/${itemId}.${ext}`,
    file.buffer,
    file.mimetype
  );
}

export async function uploadSchoolAsset(
  schoolId: string,
  kind: "logo" | "signature" | "organization",
  file: Express.Multer.File
): Promise<string> {
  const ext = file.mimetype === "image/png" ? "png" : "jpg";
  return uploadBufferToBucket(
    SCHOOL_ASSETS_BUCKET,
    `${schoolId}/${kind}.${ext}`,
    file.buffer,
    file.mimetype
  );
}

export async function uploadCardPreview(
  schoolId: string,
  studentId: string,
  pngBytes: Buffer
): Promise<string> {
  return uploadBufferToBucket(
    CARD_PREVIEWS_BUCKET,
    `${schoolId}/${studentId}.png`,
    pngBytes,
    "image/png"
  );
}

/** Smoke-check that credentials + bucket are reachable. */
export async function assertS3BucketAccessible(): Promise<void> {
  const client = getS3Client();
  const bucket = getBucketName();
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}
