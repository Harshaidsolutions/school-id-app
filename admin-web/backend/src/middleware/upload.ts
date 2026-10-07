import multer from "multer";
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

function imageFileFilter(
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

  if (!isJpg && !isPng) {
    cb(new AppError("Invalid file type. Only JPG and PNG images are allowed", 400));
    return;
  }

  cb(null, true);
}

export const uploadExcel = multer({
  storage,
  fileFilter: excelFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadStudentPhoto = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
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

export const uploadParentForm = multer({storage,fileFilter:imageFileFilter,limits:{fileSize:10*1024*1024,files:2,fields:100,fieldSize:8000}});
