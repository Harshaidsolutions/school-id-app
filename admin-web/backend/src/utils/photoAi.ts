import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import sharp from "sharp";

/**
 * Server-side photo processing for the bulk ID Card Generator.
 *
 * Heavy AI (background removal, face detection, CLAHE light correction) runs in one
 * long-lived Python worker (scripts/photo_ai_worker.py). When Python or its libraries are
 * missing, the sharp fallback still crops (attention-based), fixes light and contrast,
 * and returns a usable photo; only background removal needs the worker.
 */

export type PhotoJob = {
  removeBg: boolean;
  bg: string;
  face: boolean;
  enhance: boolean;
  width: number;
  height: number;
};

export type PhotoResult = { png: Buffer; engine: "ai" | "basic"; steps: string[]; faces: number };

type Capabilities = { python: boolean; rembg: boolean; cv2: boolean };
type Pending = { resolve: (v: { faces: number; steps: string[] }) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

let worker: ChildProcess | null = null;
let ready: Promise<Capabilities> | null = null;
let unavailableUntil = 0; // after a failed start, use the basic path for a while instead of respawning
const pending = new Map<string, Pending>();

function workerScript(): string {
  // dist/utils/photoAi.js and src/utils/photoAi.ts both live two levels below backend/
  return process.env.PHOTO_AI_SCRIPT?.trim() || path.resolve(__dirname, "../../scripts/photo_ai_worker.py");
}

function startWorker(): Promise<Capabilities> {
  if (ready) return ready;
  if (Date.now() < unavailableUntil) return Promise.resolve({ python: false, rembg: false, cv2: false });
  ready = new Promise<Capabilities>((resolve) => {
    const python = process.env.PHOTO_AI_PYTHON?.trim() || "python3";
    let settled = false;
    const done = (caps: Capabilities) => {
      if (!settled) {
        settled = true;
        resolve(caps);
      }
    };
    try {
      worker = spawn(python, [workerScript()], { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      done({ python: false, rembg: false, cv2: false });
      return;
    }
    const proc = worker;
    proc.on("error", () => done({ python: false, rembg: false, cv2: false }));
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = String(chunk).trim();
      if (text) console.warn(`[photo-ai] ${text.slice(0, 500)}`);
    });
    proc.on("exit", () => {
      if (!settled) unavailableUntil = Date.now() + 5 * 60 * 1000;
      worker = null;
      ready = null;
      for (const [, job] of pending) {
        clearTimeout(job.timer);
        job.reject(new Error("Photo AI worker stopped"));
      }
      pending.clear();
      done({ python: false, rembg: false, cv2: false });
    });
    if (!proc.stdout) {
      done({ python: false, rembg: false, cv2: false });
      return;
    }
    const lines = readline.createInterface({ input: proc.stdout });
    lines.on("line", (line) => {
      let msg: { ready?: boolean; rembg?: boolean; cv2?: boolean; id?: string; ok?: boolean; error?: string; faces?: number; steps?: string[] };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.ready) {
        done({ python: true, rembg: Boolean(msg.rembg), cv2: Boolean(msg.cv2) });
        return;
      }
      const job = msg.id ? pending.get(msg.id) : undefined;
      if (!job || !msg.id) return;
      pending.delete(msg.id);
      clearTimeout(job.timer);
      if (msg.ok) job.resolve({ faces: msg.faces ?? 0, steps: msg.steps ?? [] });
      else job.reject(new Error(msg.error || "Photo processing failed"));
    });
    setTimeout(() => done({ python: false, rembg: false, cv2: false }), 20000);
  });
  return ready;
}

export async function photoAiCapabilities(): Promise<Capabilities> {
  return startWorker();
}

function runWorker(job: Record<string, unknown>): Promise<{ faces: number; steps: string[] }> {
  return new Promise((resolve, reject) => {
    if (!worker?.stdin) {
      reject(new Error("Photo AI worker is not running"));
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Photo processing timed out"));
    }, 120000);
    pending.set(id, { resolve, reject, timer });
    worker.stdin.write(JSON.stringify({ id, ...job }) + "\n");
  });
}

async function basicProcess(input: Buffer, job: PhotoJob): Promise<PhotoResult> {
  let img = sharp(input, { limitInputPixels: 60_000_000 }).rotate();
  img = img.resize(job.width, job.height, {
    fit: "cover",
    position: job.face ? sharp.strategy.attention : "centre",
  });
  if (job.enhance) img = img.normalise({ lower: 1, upper: 99 }).sharpen({ sigma: 0.8 });
  const png = await img.flatten({ background: job.bg }).png().toBuffer();
  return { png, engine: "basic", steps: [job.face ? "centre" : "fit", ...(job.enhance ? ["enhance"] : [])], faces: 0 };
}

export async function processPhoto(input: Buffer, job: PhotoJob): Promise<PhotoResult> {
  const caps = await startWorker();
  if (!caps.python) {
    if (job.removeBg) {
      throw Object.assign(new Error("Background removal needs the photo AI service on the server. Run admin-web/scripts/setup-photo-ai.sh on EC2."), { status: 501 });
    }
    return basicProcess(input, job);
  }
  if (job.removeBg && !caps.rembg) {
    throw Object.assign(new Error("Background removal is not installed on the server. Run admin-web/scripts/setup-photo-ai.sh on EC2."), { status: 501 });
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "idgen-"));
  const inPath = path.join(dir, "in.img");
  const outPath = path.join(dir, "out.png");
  try {
    // Normalise first: sharp handles HEIC/WebP/CMYK/EXIF that Pillow may not.
    const normalised = await sharp(input, { limitInputPixels: 60_000_000 }).rotate().png().toBuffer();
    await fs.writeFile(inPath, normalised);
    const result = await runWorker({
      in: inPath,
      out: outPath,
      removeBg: job.removeBg,
      bg: job.bg,
      face: job.face,
      enhance: job.enhance,
      w: job.width,
      h: job.height,
    });
    const png = await fs.readFile(outPath);
    return { png, engine: "ai", steps: result.steps, faces: result.faces };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
