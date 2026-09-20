/**
 * Verifies AWS S3 credentials and that S3_BUCKET_NAME is reachable.
 * Create the bucket in AWS Console first (see project docs / agent instructions).
 *
 * Usage: npm run setup:storage --prefix backend
 */
import "dotenv/config";
import {
  assertS3BucketAccessible,
  CARD_PREVIEWS_BUCKET,
  PRINT_PDFS_BUCKET,
  SCHOOL_ASSETS_BUCKET,
  STUDENT_PHOTOS_BUCKET,
  TEMPLATES_BUCKET,
} from "../src/config/storage";

const FOLDERS = [
  STUDENT_PHOTOS_BUCKET,
  PRINT_PDFS_BUCKET,
  TEMPLATES_BUCKET,
  SCHOOL_ASSETS_BUCKET,
  CARD_PREVIEWS_BUCKET,
];

async function main() {
  const bucket = process.env.S3_BUCKET_NAME?.trim();
  const region = process.env.AWS_REGION?.trim();

  if (!bucket || !region) {
    throw new Error("S3_BUCKET_NAME and AWS_REGION must be set in the environment");
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn(
      "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set — relying on default credential chain."
    );
  }

  await assertS3BucketAccessible();
  console.log(`OK: bucket "${bucket}" reachable in ${region}.`);
  console.log("Object key prefixes (logical folders):");
  for (const folder of FOLDERS) {
    console.log(`  ${folder}/`);
  }
  console.log("Storage setup check complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Storage setup failed:", error);
    process.exit(1);
  });
