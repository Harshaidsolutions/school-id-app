/**
 * Large photo ZIP import (up to 500 MB per ZIP, any number of ZIPs one after another).
 *
 * The browser / admin app sends the ZIP in 8 MB pieces (so nginx's body limit never
 * matters), the server appends them to one temp file, then a background job reads the
 * ZIP entry-by-entry (never the whole ZIP in memory) and puts every image on the record
 * whose Photo Number equals the image file name (ADD_001.jpg → record ADD_001).
 *
 *   POST /admin/photo-import/chunk?uploadId=…&index=0&total=63   (raw bytes)
 *   POST /admin/photo-import/finish  { uploadId, orgId, kind, replace, fileName }
 *   GET  /admin/photo-import/jobs/:id
 */
import type { NextFunction, Request, Response } from "express";
import express from "express";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import sharp from "sharp";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { requireAdminScope, assertSchoolOwnedByAdmin, assertInstituteOwnedByAdmin } from "../utils/adminScope";
import { uploadStudentPhotoToStorage } from "../config/storage";

export const PHOTO_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_BYTES = 520 * 1024 * 1024;
const MAX_ENTRIES = 20000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const TMP_ROOT = path.join(os.tmpdir(), "msidc-photo-import");

/** Raw body parser for one chunk (a little over the chunk size). */
export const photoChunkBody = express.raw({ type: () => true, limit: PHOTO_CHUNK_BYTES + 1024 * 1024 });

type Result = { file: string; status: "uploaded" | "skipped" | "failed"; reason?: string };
type Job = {
  id: string;
  ownerId: string;
  status: "processing" | "done" | "failed";
  fileName: string;
  total: number;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  results: Result[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
};
const jobs = new Map<string, Job>();

function ownerOf(scope: unknown): string {
  const s = scope as { adminUserId?: string; userId?: string };
  return String(s.adminUserId ?? s.userId ?? "admin");
}

function safeUploadId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new AppError("Invalid upload id", 400);
  return id;
}

function uploadPath(owner: string, uploadId: string) {
  const key = crypto.createHash("sha1").update(`${owner}:${uploadId}`).digest("hex");
  return path.join(TMP_ROOT, `${key}.zip`);
}

/** Removes half-finished uploads older than 6 hours and finished jobs older than a day. */
async function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > 24 * 3600 * 1000) jobs.delete(id);
  try {
    for (const name of await fsp.readdir(TMP_ROOT)) {
      const p = path.join(TMP_ROOT, name);
      const st = await fsp.stat(p).catch(() => null);
      if (st && now - st.mtimeMs > 6 * 3600 * 1000) await fsp.rm(p, { force: true });
    }
  } catch {
    /* folder not created yet */
  }
}

export async function receivePhotoChunk(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await requireAdminScope(req);
    const owner = ownerOf(scope);
    const uploadId = safeUploadId(req.query.uploadId);
    const index = Number(req.query.index);
    const total = Number(req.query.total);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || index >= total) {
      throw new AppError("Invalid chunk number", 400);
    }
    if (total * PHOTO_CHUNK_BYTES > MAX_ZIP_BYTES + PHOTO_CHUNK_BYTES) throw new AppError("ZIP is larger than 500 MB. Split it into smaller ZIPs.", 413);
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError("Empty chunk", 400);
    if (body.length > PHOTO_CHUNK_BYTES || (index < total - 1 && body.length !== PHOTO_CHUNK_BYTES)) {
      throw new AppError("Chunk has the wrong size", 400);
    }
    await fsp.mkdir(TMP_ROOT, { recursive: true });
    if (index === 0) void sweep();
    const file = uploadPath(owner, uploadId);
    const offset = index * PHOTO_CHUNK_BYTES;
    const handle = await fsp.open(file, index === 0 ? "w" : "r+").catch(async (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") throw new AppError("Upload expired. Start the upload again.", 409);
      throw e;
    });
    try {
      const size = (await handle.stat()).size;
      if (size < offset) throw new AppError("A previous part is missing. Start the upload again.", 409);
      // Retrying a part is safe: cut back to where this part starts, then write it.
      await handle.truncate(offset);
      await handle.write(body, 0, body.length, offset);
    } finally {
      await handle.close();
    }
    res.json({ status: "ok", received: index + 1, total });
  } catch (e) {
    next(e);
  }
}

export async function finishPhotoUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await requireAdminScope(req);
    const owner = ownerOf(scope);
    const uploadId = safeUploadId(req.body?.uploadId);
    const orgId = String(req.body?.orgId ?? "");
    const kind = String(req.body?.kind ?? "");
    const replace = req.body?.replace === true || req.body?.replace === "true";
    const fileName = String(req.body?.fileName ?? "photos.zip").slice(0, 200);
    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !["school", "institute"].includes(kind)) throw new AppError("Select a school or institute", 400);
    if (kind === "school") await assertSchoolOwnedByAdmin(scope, orgId);
    else await assertInstituteOwnedByAdmin(scope, orgId);
    const file = uploadPath(owner, uploadId);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) throw new AppError("Upload not found. Start the upload again.", 404);
    if (st.size > MAX_ZIP_BYTES) {
      await fsp.rm(file, { force: true });
      throw new AppError("ZIP is larger than 500 MB. Split it into smaller ZIPs.", 413);
    }
    const job: Job = {
      id: crypto.randomUUID(),
      ownerId: owner,
      status: "processing",
      fileName,
      total: 0,
      processed: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      results: [],
      startedAt: Date.now(),
    };
    jobs.set(job.id, job);
    res.json({ status: "ok", jobId: job.id });
    void runJob(job, file, orgId, kind as "school" | "institute", replace);
  } catch (e) {
    next(e);
  }
}

export async function photoImportJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await requireAdminScope(req);
    const job = jobs.get(String(req.params.id ?? ""));
    if (!job || job.ownerId !== ownerOf(scope)) throw new AppError("This upload is no longer running. If the server restarted, upload the ZIP again.", 404);
    res.json({ status: "ok", job });
  } catch (e) {
    next(e);
  }
}

/* ───────────────────────── ZIP reading (streaming, no full load) ───────────────────────── */

type Entry = { name: string; method: number; compSize: number; size: number; localOffset: number; encrypted: boolean };

async function readAt(fd: fsp.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await fd.read(buf, done, length - done, position + done);
    if (!bytesRead) break;
    done += bytesRead;
  }
  return done === length ? buf : buf.subarray(0, done);
}

async function listZipEntries(fd: fsp.FileHandle, fileSize: number): Promise<Entry[]> {
  const tailLen = Math.min(fileSize, 65557 + 22);
  const tail = await readAt(fd, fileSize - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new AppError("This file is not a valid ZIP", 400);
  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    // ZIP64
    const locPos = eocd - 20;
    if (locPos < 0 || tail.readUInt32LE(locPos) !== 0x07064b50) throw new AppError("This ZIP could not be read", 400);
    const z64Pos = Number(tail.readBigUInt64LE(locPos + 8));
    const z64 = await readAt(fd, z64Pos, 56);
    if (z64.readUInt32LE(0) !== 0x06064b50) throw new AppError("This ZIP could not be read", 400);
    count = Number(z64.readBigUInt64LE(32));
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }
  if (count > MAX_ENTRIES) throw new AppError(`ZIP has more than ${MAX_ENTRIES} files. Split it into smaller ZIPs.`, 400);
  if (cdOffset + cdSize > fileSize) throw new AppError("This ZIP is incomplete. Upload it again.", 400);
  const cd = await readAt(fd, cdOffset, cdSize);
  const entries: Entry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    let compSize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let localOffset = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? "utf8" : "latin1");
    const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    for (let e = 0; e + 4 <= extra.length; ) {
      const id = extra.readUInt16LE(e);
      const len = extra.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff && q + 8 <= e + 4 + len) (size = Number(extra.readBigUInt64LE(q))), (q += 8);
        if (compSize === 0xffffffff && q + 8 <= e + 4 + len) (compSize = Number(extra.readBigUInt64LE(q))), (q += 8);
        if (localOffset === 0xffffffff && q + 8 <= e + 4 + len) localOffset = Number(extra.readBigUInt64LE(q));
      }
      e += 4 + len;
    }
    entries.push({ name, method, compSize, size, localOffset, encrypted: Boolean(flags & 0x1) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(fd: fsp.FileHandle, entry: Entry): Promise<Buffer> {
  const header = await readAt(fd, entry.localOffset, 30);
  if (header.length < 30 || header.readUInt32LE(0) !== 0x04034b50) throw new Error("bad local header");
  const start = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const raw = await readAt(fd, start, entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: MAX_IMAGE_BYTES + 1 });
  throw new Error("unsupported compression");
}

/* ───────────────────────── the job ───────────────────────── */

async function runJob(job: Job, file: string, orgId: string, kind: "school" | "institute", replace: boolean) {
  const column = kind === "school" ? "school_id" : "institute_id";
  let fd: fsp.FileHandle | null = null;
  try {
    const st = await fsp.stat(file);
    fd = await fsp.open(file, "r");
    const all = await listZipEntries(fd, st.size);
    const images = all.filter((e) => !e.name.endsWith("/") && !e.name.startsWith("__MACOSX/") && !path.basename(e.name).startsWith("."));
    job.total = images.length;
    if (!images.length) throw new AppError("The ZIP has no images", 400);

    const rows = (await pool.query<{ id: string; photo_id: string | null }>(`SELECT id, photo_id FROM students WHERE ${column} = $1`, [orgId])).rows;
    const byNumber = new Map<string, string[]>();
    for (const row of rows) {
      const key = String(row.photo_id ?? "").trim().toLowerCase();
      if (key) byNumber.set(key, [...(byNumber.get(key) ?? []), row.id]);
    }
    const keyOf = (name: string) => path.parse(path.basename(name)).name.trim().toLowerCase();
    const nameCount = new Map<string, number>();
    for (const e of images) nameCount.set(keyOf(e.name), (nameCount.get(keyOf(e.name)) ?? 0) + 1);

    const add = (r: Result) => {
      job.processed += 1;
      if (r.status === "uploaded") job.uploaded += 1;
      else if (r.status === "skipped") job.skipped += 1;
      else job.failed += 1;
      if (r.status !== "uploaded" || job.results.length < 5000) job.results.push(r);
    };

    for (const entry of images) {
      const display = path.basename(entry.name);
      const key = keyOf(entry.name);
      if (!/\.(jpe?g|png)$/i.test(entry.name)) {
        add({ file: display, status: "skipped", reason: "Only JPG and PNG images are supported" });
        continue;
      }
      if (entry.encrypted) {
        add({ file: display, status: "skipped", reason: "Password-protected ZIP files are not supported" });
        continue;
      }
      if (entry.size > MAX_IMAGE_BYTES) {
        add({ file: display, status: "skipped", reason: "Image is larger than 25 MB" });
        continue;
      }
      const matches = byNumber.get(key) ?? [];
      if (matches.length !== 1 || nameCount.get(key) !== 1) {
        add({
          file: display,
          status: "skipped",
          reason: matches.length === 0 ? "No record with this Photo Number" : matches.length > 1 ? "Two records share this Photo Number — fix the data first" : "The ZIP has two images with this name",
        });
        continue;
      }
      const client = await pool.connect();
      try {
        const bytes = await readEntry(fd, entry);
        const buffer = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().jpeg({ quality: 92 }).toBuffer();
        await client.query("BEGIN");
        const current = (await client.query<{ id: string; photo_url: string | null }>(`SELECT id, photo_url FROM students WHERE id = $1 AND ${column} = $2 FOR UPDATE`, [matches[0], orgId])).rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          add({ file: display, status: "skipped", reason: "Record was deleted" });
          continue;
        }
        if (current.photo_url && !replace) {
          await client.query("ROLLBACK");
          add({ file: display, status: "skipped", reason: "Photo already exists (turn on Replace to overwrite)" });
          continue;
        }
        const upload = { buffer, mimetype: "image/jpeg", originalname: display, size: buffer.length } as Express.Multer.File;
        const url = await uploadStudentPhotoToStorage(orgId, current.id, upload);
        await client.query(
          `UPDATE students SET photo_url = $1, photo_captured_at = NOW(), photo_cropped = false, status = 'captured', updated_at = NOW() WHERE id = $2`,
          [url, current.id]
        );
        await client.query("COMMIT");
        add({ file: display, status: "uploaded" });
      } catch {
        await client.query("ROLLBACK").catch(() => undefined);
        add({ file: display, status: "failed", reason: "Invalid image or upload failed. Upload this ZIP again to retry." });
      } finally {
        client.release();
      }
    }
    job.status = "done";
  } catch (e) {
    job.status = "failed";
    job.error = e instanceof AppError ? e.message : "The ZIP could not be processed. Upload it again.";
  } finally {
    job.finishedAt = Date.now();
    await fd?.close().catch(() => undefined);
    await fsp.rm(file, { force: true }).catch(() => undefined);
  }
}

