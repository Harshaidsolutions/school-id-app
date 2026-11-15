import multer from "multer";
import sharp from "sharp";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../middleware/errorHandler";

const storage = multer.memoryStorage();

function excelFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const name = file.originalname.toLowerCase();
  const isXlsx =
    name.endsWith(".xlsx") ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/octet-stream";

  if (!isXlsx) {
    cb(new AppError("Only .xlsx Excel files are allowed", 400));
    return;
  }

  cb(null, true);
}

const PHONE_IMAGE = /\.(heic|heif|webp)$/;
const PHONE_MIME = /^image\/(heic|heif|webp|heic-sequence|heif-sequence)$/;

function imageFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  const isJpg =
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    mime === "image/jpeg" ||
    mime === "image/jpg";
  const isPng = name.endsWith(".png") || mime === "image/png";
  // Phone galleries often give HEIC (iPhone) or WEBP pictures: accepted and turned into JPG below.
  const isPhone = PHONE_IMAGE.test(name) || PHONE_MIME.test(mime);

  if (!isJpg && !isPng && !isPhone) {
    cb(new AppError("Invalid file type. Choose a JPG, PNG, HEIC or WEBP photo", 400));
    return;
  }

  cb(null, true);
}

/** Pictures bigger than this are made smaller (still sharp enough for printing). */
const SHRINK_ABOVE = 8 * 1024 * 1024;
const MAX_SIDE = 4000;

async function normalizeFile(file: Express.Multer.File): Promise<void> {
  if (!file?.buffer?.length) return;
  const name = file.originalname || "photo";
  const lower = name.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  const isPng = lower.endsWith(".png") || mime === "image/png";
  const b = file.buffer;
  const realJpg = b[0] === 0xff && b[1] === 0xd8;
  const realPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  // Some phones send HEIC / WEBP content named ".jpg": judge by the file's own bytes.
  const isPhone = PHONE_IMAGE.test(lower) || PHONE_MIME.test(mime) || (!realJpg && !realPng);
  // Normal JPG / PNG of a sensible size stay exactly as they were (PNG keeps transparency).
  if (!isPhone && file.size <= SHRINK_ABOVE) return;
  try {
    const img = sharp(file.buffer, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
    const keepPng = isPng && !isPhone;
    const out = keepPng
      ? await img.png({ compressionLevel: 9 }).toBuffer()
      : await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    file.buffer = out;
    file.size = out.length;
    file.mimetype = keepPng ? "image/png" : "image/jpeg";
    file.originalname = keepPng ? name : name.replace(/\.[^.]+$/, "") + ".jpg";
  } catch {
    throw new AppError(
      "This photo could not be read. Please choose a JPG or PNG photo, or take the photo with the app camera.",
      400
    );
  }
}

/** Turns phone photos (HEIC / WEBP / very large) into normal JPG files after multer has read them. */
export async function normalizeUploads(req: Request): Promise<void> {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  const f = req.files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
  if (Array.isArray(f)) files.push(...f);
  else if (f) for (const list of Object.values(f)) files.push(...list);
  for (const file of files) await normalizeFile(file);
}

function thenNormalize(mw: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err?: unknown) => {
      if (err) return next(err);
      normalizeUploads(req).then(() => next(), next);
    });
  };
}

/** A multer instance whose single / array / fields / any also convert phone photos. */
function imageUploader(options: multer.Options) {
  const m = multer(options);
  return {
    single: (name: string) => thenNormalize(m.single(name)),
    array: (name: string, maxCount?: number) => thenNormalize(m.array(name, maxCount)),
    fields: (fields: readonly multer.Field[]) => thenNormalize(m.fields(fields)),
    any: () => thenNormalize(m.any()),
    none: () => m.none(),
  };
}

export const uploadExcel = multer({
  storage,
  fileFilter: excelFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadStudentPhoto = imageUploader({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const uploadImage = imageUploader({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

/** School create/update: optional logo + signature + organization photo */
export const uploadSchoolAssets = uploadImage.fields([
  { name: "logo", maxCount: 1 },
  { name: "signature", maxCount: 1 },
  { name: "organization", maxCount: 1 },
]);

function catalogFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const name = file.originalname.toLowerCase();
  const isJpg =
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    file.mimetype === "image/jpeg";
  const isPng = name.endsWith(".png") || file.mimetype === "image/png";
  const isPdf = name.endsWith(".pdf") || file.mimetype === "application/pdf";

  if (!isJpg && !isPng && !isPdf) {
    cb(
      new AppError(
        "Invalid file type. Only JPG, PNG, or PDF files are allowed",
        400
      )
    );
    return;
  }

  cb(null, true);
}

/** Template create/update: optional template image (JPG, PNG, PDF) */
export const uploadTemplateImageField = multer({
  storage,
  fileFilter: catalogFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("image");

export const uploadCatalogFile = multer({
  storage,
  fileFilter: catalogFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function catalogMediaFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  const isJpg =
    name.endsWith(".jpg") || name.endsWith(".jpeg") || mime === "image/jpeg";
  const isPng = name.endsWith(".png") || mime === "image/png";
  const isPdf = name.endsWith(".pdf") || mime === "application/pdf";
  const isMp4 = name.endsWith(".mp4") && (mime === "video/mp4" || mime === "application/octet-stream");
  const isWebm = name.endsWith(".webm") && (mime === "video/webm" || mime === "application/octet-stream");
  const isMov =
    name.endsWith(".mov") &&
    (mime === "video/quicktime" || mime === "application/octet-stream");

  if (!isJpg && !isPng && !isPdf && !isMp4 && !isWebm && !isMov) {
    cb(
      new AppError(
        "Invalid file type. Only JPG, PNG, PDF, MP4, WEBM, or MOV files are allowed",
        400
      )
    );
    return;
  }

  cb(null, true);
}

/** Catalog create/update. Models may include an image and a video. */
export const uploadCatalogMedia = multer({
  storage,
  fileFilter: catalogMediaFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const uploadParentForm = imageUploader({storage,fileFilter:imageFileFilter,limits:{fileSize:25*1024*1024,files:2,fields:100,fieldSize:8000}});
