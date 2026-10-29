import { execFile } from "child_process";
import { Request, Response, NextFunction } from "express";
import { promises as fs } from "fs";
import multer from "multer";
import os from "os";
import path from "path";
import * as XLSX from "xlsx";
import { pool } from "../config/database";
import { readBucketObject, TEMPLATES_BUCKET } from "../config/storage";
import { AppError } from "../middleware/errorHandler";
import { adminCatalogOwnerSql, requireAdminScope } from "../utils/adminScope";
import { photoAiCapabilities, processPhoto } from "../utils/photoAi";
import { routeParam } from "../utils/routeParams";

/**
 * Bulk ID Card Generator support API.
 * Card layout, QR/barcodes, sheet imposition and RGB PDF/PNG/TIFF export run in the browser;
 * the server handles spreadsheet parsing, photo AI, PDF template rasterising and CMYK conversion.
 */

const memory = multer.memoryStorage();

export const generatorSheetUpload = multer({
  storage: memory,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (/\.(xlsx|xls|csv|ods)$/.test(name)) cb(null, true);
    else cb(new AppError("Upload an Excel (.xlsx/.xls), .ods or .csv file", 400));
  },
}).single("sheet");

export const generatorPhotoUpload = multer({
  storage: memory,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i.test(file.originalname)) cb(null, true);
    else cb(new AppError("Only image files can be processed", 400));
  },
}).single("photo");

export const generatorPdfUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 600 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) cb(null, true);
    else cb(new AppError("Upload a PDF file", 400));
  },
}).single("pdf");

function run(cmd: string, args: string[], timeoutMs = 10 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 400)));
      else resolve();
    });
  });
}

let gsAvailable: Promise<boolean> | null = null;
function ghostscript(): Promise<boolean> {
  if (!gsAvailable) gsAvailable = run("gs", ["--version"], 10000).then(() => true, () => false);
  return gsAvailable;
}

async function rasterizePdfPage(pdfPath: string, page: number, dpi: number): Promise<Buffer> {
  if (!(await ghostscript())) {
    throw new AppError("PDF templates need Ghostscript on the server. Run admin-web/scripts/setup-photo-ai.sh, or upload PNG/JPG templates.", 501);
  }
  const out = path.join(os.tmpdir(), `idgen-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  try {
    await run("gs", [
      "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=png16m",
      `-r${dpi}`, `-dFirstPage=${page}`, `-dLastPage=${page}`,
      "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", `-sOutputFile=${out}`, pdfPath,
    ]);
    return await fs.readFile(out);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`This PDF page could not be read (${page}).`, 400);
  } finally {
    await fs.rm(out, { force: true }).catch(() => undefined);
  }
}

export async function generatorCapabilities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireAdminScope(req);
    const [ai, gs] = await Promise.all([photoAiCapabilities(), ghostscript()]);
    res.json({ status: "ok", photoAi: ai.python, backgroundRemoval: ai.rembg, faceDetection: ai.cv2, ghostscript: gs });
  } catch (error) {
    next(error);
  }
}

/** Reads every row of the first (or chosen) sheet as text exactly as shown in Excel. */
export async function parseGeneratorSheet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireAdminScope(req);
    if (!req.file) throw new AppError("Choose a spreadsheet to upload", 400);
    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false, raw: false, codepage: 65001 });
    const sheetNames = workbook.SheetNames;
    const wanted = typeof req.body.sheet === "string" && sheetNames.includes(req.body.sheet) ? req.body.sheet : sheetNames[0];
    if (!wanted) throw new AppError("The spreadsheet has no sheets", 400);
    const sheet = workbook.Sheets[wanted];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    // Header = first row that has at least two filled cells (skips title rows above the table)
    let headerIndex = matrix.findIndex((row) => row.filter((c) => String(c ?? "").trim() !== "").length >= 2);
    if (headerIndex < 0) headerIndex = 0;
    const header = (matrix[headerIndex] ?? []).map((c, i) => String(c ?? "").trim() || `Column ${i + 1}`);
    const seen = new Map<string, number>();
    const columns = header.map((name) => {
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      return n > 1 ? `${name} (${n})` : name;
    });
    const rows = matrix
      .slice(headerIndex + 1)
      .map((row) => Object.fromEntries(columns.map((col, i) => [col, String(row[i] ?? "").trim()])))
      .filter((row) => Object.values(row).some((v) => v !== ""));
    if (rows.length > 20000) throw new AppError("Up to 20,000 rows can be generated at once. Split the file.", 400);
    res.json({ status: "ok", sheet: wanted, sheets: sheetNames, columns, rows });
  } catch (error) {
    next(error);
  }
}

function hexColour(value: unknown): string {
  const v = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#ffffff";
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "on";
}

export async function processGeneratorPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireAdminScope(req);
    if (!req.file) throw new AppError("Photo file is required", 400);
    const width = Math.round(Number(req.body.width) || 600);
    const height = Math.round(Number(req.body.height) || 750);
    if (width < 50 || height < 50 || width > 3000 || height > 3000) throw new AppError("Output size must be 50–3000 px", 400);
    try {
      const result = await processPhoto(req.file.buffer, {
        removeBg: bool(req.body.removeBg),
        bg: hexColour(req.body.bg),
        face: bool(req.body.face),
        enhance: bool(req.body.enhance),
        width,
        height,
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Photo-Engine", result.engine);
      res.setHeader("X-Photo-Steps", result.steps.join(","));
      res.setHeader("X-Photo-Faces", String(result.faces));
      res.setHeader("Access-Control-Expose-Headers", "X-Photo-Engine, X-Photo-Steps, X-Photo-Faces");
      res.send(result.png);
    } catch (error) {
      const status = (error as { status?: number }).status;
      throw new AppError(error instanceof Error ? error.message : "Photo could not be processed", status ?? 422);
    }
  } catch (error) {
    next(error);
  }
}

/** Template library image as bytes (same-origin, so the browser can draw it on a canvas). */
export async function generatorTemplateImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const id = routeParam(req.params.id);
    const owner = adminCatalogOwnerSql(scope, "templates", 1);
    const result = await pool.query<{ id: string; image_url: string | null }>(
      `SELECT id, image_url FROM templates WHERE id = $1 AND owner_admin_id = $2`,
      [id, owner.value]
    );
    const row = result.rows[0];
    if (!row?.image_url) throw new AppError("Template not found", 404);
    const ext = (row.image_url.split("?")[0].split(".").pop() ?? "jpg").toLowerCase();
    const object = await readBucketObject(TEMPLATES_BUCKET, `global/${row.id}.${ext}`);
    if (!object) throw new AppError("Template image could not be read", 404);
    if (ext === "pdf") {
      const page = Math.max(1, Math.min(2, Number(req.query.page) || 1));
      const tmp = path.join(os.tmpdir(), `idgen-tpl-${row.id}-${Date.now()}.pdf`);
      await fs.writeFile(tmp, object.bytes);
      try {
        const png = await rasterizePdfPage(tmp, page, 300);
        res.setHeader("Content-Type", "image/png");
        res.send(png);
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
      return;
    }
    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(Buffer.from(object.bytes));
  } catch (error) {
    next(error);
  }
}

/** Uploaded PDF template → PNG of one page at 300 DPI. */
export async function rasterizeGeneratorPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  const file = req.file;
  try {
    await requireAdminScope(req);
    if (!file) throw new AppError("PDF file is required", 400);
    const page = Math.max(1, Math.min(50, Number(req.body.page) || 1));
    const dpi = Number(req.body.dpi) === 600 ? 600 : 300;
    const png = await rasterizePdfPage(file.path, page, dpi);
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (error) {
    next(error);
  } finally {
    if (file?.path) await fs.rm(file.path, { force: true }).catch(() => undefined);
  }
}

/** RGB print PDF → press-ready CMYK PDF (Ghostscript; optional ICC profile via CMYK_ICC_PROFILE). */
export async function convertGeneratorPdfToCmyk(req: Request, res: Response, next: NextFunction): Promise<void> {
  const file = req.file;
  const out = path.join(os.tmpdir(), `idgen-cmyk-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    await requireAdminScope(req);
    if (!file) throw new AppError("PDF file is required", 400);
    if (!(await ghostscript())) {
      throw new AppError("CMYK export needs Ghostscript on the server. Run admin-web/scripts/setup-photo-ai.sh on EC2.", 501);
    }
    const args = [
      "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.6",
      "-sColorConversionStrategy=CMYK", "-sProcessColorModel=DeviceCMYK", "-dOverrideICC=true",
      "-dDownsampleColorImages=false", "-dDownsampleGrayImages=false",
      "-dAutoFilterColorImages=false", "-dColorImageFilter=/DCTEncode", "-dJPEGQ=95",
    ];
    const icc = process.env.CMYK_ICC_PROFILE?.trim();
    if (icc) args.push(`-sOutputICCProfile=${icc}`);
    args.push(`-sOutputFile=${out}`, file.path);
    await run("gs", args, 30 * 60 * 1000);
    const name = String(req.body.name || "id-cards-cmyk").replace(/[^\w.-]+/g, "_").slice(0, 80);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
    res.sendFile(out, (err) => {
      void fs.rm(out, { force: true }).catch(() => undefined);
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    await fs.rm(out, { force: true }).catch(() => undefined);
    next(error);
  } finally {
    if (file?.path) await fs.rm(file.path, { force: true }).catch(() => undefined);
  }
}
