/**
 * One-time: copy student photos from existing public HTTP(S) URLs
 * into the configured S3 bucket, then rewrite students.photo_url to the new S3 URL.
 *
 * Prerequisites in backend/.env:
 *   DATABASE_URL
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME
 *   (optional) S3_PUBLIC_BASE_URL
 *
 * Usage:
 *   npm run migrate:photos-to-s3 --prefix backend
 *   npm run migrate:photos-to-s3 --prefix backend -- --dry-run
 *   npm run migrate:photos-to-s3 --prefix backend -- --limit=50
 */
import "dotenv/config";
import { pool } from "../src/config/database";
import {
  STUDENT_PHOTOS_BUCKET,
  assertS3BucketAccessible,
  publicObjectUrl,
  studentPhotoPathFromUrl,
  studentPhotoStoragePath,
  uploadBufferToBucket,
} from "../src/config/storage";

interface StudentRow {
  id: string;
  school_id: string | null;
  photo_url: string;
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  return {
    dryRun,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? limit : undefined,
  };
}

function isAlreadyOnS3(url: string): boolean {
  const bucket = process.env.S3_BUCKET_NAME?.trim();
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (publicBase && url.startsWith(publicBase)) {
    return true;
  }
  if (bucket && url.includes(`${bucket}.s3.`) && url.includes(".amazonaws.com")) {
    return true;
  }
  if (bucket && url.includes(`amazonaws.com/${bucket}/`)) {
    return true;
  }
  return false;
}

function isRemoteHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function downloadPhoto(
  url: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  download HTTP ${res.status}: ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      console.warn(`  empty body: ${url}`);
      return null;
    }
    return { buffer, contentType };
  } catch (error) {
    console.warn(`  download error: ${url}`, error);
    return null;
  }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  console.log("Checking S3 bucket access...");
  await assertS3BucketAccessible();
  console.log(
    `S3 OK (bucket=${process.env.S3_BUCKET_NAME}, region=${process.env.AWS_REGION})`
  );
  if (dryRun) {
    console.log("DRY RUN — no uploads or DB updates will be performed.\n");
  }

  const params: unknown[] = [];
  let sql = `
    SELECT id, school_id, photo_url
    FROM students
    WHERE photo_url IS NOT NULL
      AND trim(photo_url) <> ''
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  `;
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $1`;
  }

  const { rows } = await pool.query<StudentRow>(sql, params);
  console.log(`Found ${rows.length} student(s) with photo_url.\n`);

  const summary = {
    total: rows.length,
    skippedAlreadyS3: 0,
    skippedBadUrl: 0,
    migrated: 0,
    failed: 0,
  };

  for (const student of rows) {
    const label = `student ${student.id}`;
    const oldUrl = student.photo_url.trim();

    if (isAlreadyOnS3(oldUrl)) {
      summary.skippedAlreadyS3 += 1;
      console.log(`[skip] ${label}: already on S3`);
      continue;
    }

    if (!isRemoteHttpUrl(oldUrl)) {
      summary.skippedBadUrl += 1;
      console.log(`[skip] ${label}: not an http(s) URL`);
      continue;
    }

    const relativePath =
      studentPhotoPathFromUrl(oldUrl, student.school_id, student.id) ??
      (student.school_id
        ? studentPhotoStoragePath(student.school_id, student.id)
        : `${student.id}.jpg`);

    const newUrl = publicObjectUrl(STUDENT_PHOTOS_BUCKET, relativePath);
    console.log(`[migrate] ${label}`);
    console.log(`  from: ${oldUrl}`);
    console.log(`  to:   ${newUrl}`);

    if (dryRun) {
      summary.migrated += 1;
      continue;
    }

    const downloaded = await downloadPhoto(oldUrl);
    if (!downloaded) {
      summary.failed += 1;
      console.log(`  FAILED download`);
      continue;
    }

    try {
      const uploadedUrl = await uploadBufferToBucket(
        STUDENT_PHOTOS_BUCKET,
        relativePath,
        downloaded.buffer,
        downloaded.contentType.startsWith("image/")
          ? downloaded.contentType
          : "image/jpeg"
      );

      await pool.query(
        `UPDATE students
         SET photo_url = $1, updated_at = NOW()
         WHERE id = $2`,
        [uploadedUrl, student.id]
      );

      summary.migrated += 1;
      console.log(`  OK (${downloaded.buffer.length} bytes)`);
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  FAILED upload/update: ${message}`);
    }
  }

  console.log("\n── Summary ──");
  console.log(`  total:              ${summary.total}`);
  console.log(`  migrated:           ${summary.migrated}`);
  console.log(`  skipped (already):  ${summary.skippedAlreadyS3}`);
  console.log(`  skipped (bad URL):  ${summary.skippedBadUrl}`);
  console.log(`  failed:             ${summary.failed}`);
  if (dryRun) {
    console.log("  (dry-run — re-run without --dry-run to apply)");
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Photo migration failed:", error);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
