import * as FileSystem from "expo-file-system/legacy";
import api, { API_BASE_URL, errMsg, getAuthToken } from "../api/client";
import type { PickedFile } from "./files";

/** Must match PHOTO_CHUNK_BYTES on the server. */
const CHUNK = 8 * 1024 * 1024;
export const MAX_ZIP_MB = 500;

export type ImportResult = { file: string; status: string; reason?: string };
export type ImportJob = {
  status: "processing" | "done" | "failed";
  total: number;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  results: ImportResult[];
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a big photo ZIP (up to 500 MB) in 8 MB parts, then waits while the server puts
 * every photo on the record with the same Photo Number.
 */
export async function uploadPhotoZip(
  file: PickedFile,
  opts: { orgId: string; kind: "school" | "institute"; replace: boolean; onProgress: (text: string, fraction: number) => void; isCancelled: () => boolean }
): Promise<ImportJob> {
  let size = file.size ?? 0;
  if (!size) {
    const info = await FileSystem.getInfoAsync(file.uri);
    size = info.exists && "size" in info ? (info.size ?? 0) : 0;
  }
  if (!size) throw new Error("Could not read the ZIP file. Choose it again.");
  if (size > MAX_ZIP_MB * 1024 * 1024) throw new Error(`ZIP is larger than ${MAX_ZIP_MB} MB. Split it into smaller ZIPs.`);
  const total = Math.max(1, Math.ceil(size / CHUNK));
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const temp = `${FileSystem.cacheDirectory}zip-part-${uploadId}.bin`;
  const mbText = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
  try {
    for (let i = 0; i < total; i++) {
      if (opts.isCancelled()) throw new Error("Upload stopped.");
      const position = i * CHUNK;
      const length = Math.min(CHUNK, size - position);
      const data = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64, position, length });
      await FileSystem.writeAsStringAsync(temp, data, { encoding: FileSystem.EncodingType.Base64 });
      let attempt = 0;
      for (;;) {
        const token = getAuthToken();
        try {
          const res = await FileSystem.uploadAsync(
            `${API_BASE_URL}/admin/photo-import/chunk?uploadId=${uploadId}&index=${i}&total=${total}`,
            temp,
            {
              httpMethod: "POST",
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: { "Content-Type": "application/octet-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            }
          );
          if (res.status >= 200 && res.status < 300) break;
          let message = `Upload failed (${res.status}).`;
          try {
            message = (JSON.parse(res.body) as { message?: string }).message ?? message;
          } catch {
            /* not JSON */
          }
          if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 413) throw Object.assign(new Error(message), { fatal: true });
          throw new Error(message);
        } catch (e) {
          attempt += 1;
          if ((e as { fatal?: boolean }).fatal || attempt >= 4) throw e;
          await sleep(1500 * attempt);
        }
      }
      opts.onProgress(`Sending ZIP: ${mbText(Math.min(size, position + length))} of ${mbText(size)}`, ((i + 1) / total) * 0.5);
    }
  } finally {
    await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => undefined);
  }
  const { data } = await api.post<{ jobId: string }>("/admin/photo-import/finish", {
    uploadId,
    orgId: opts.orgId,
    kind: opts.kind,
    replace: opts.replace,
    fileName: file.name,
  });
  let misses = 0;
  for (;;) {
    await sleep(1500);
    try {
      const { data: s } = await api.get<{ job: ImportJob }>(`/admin/photo-import/jobs/${data.jobId}`);
      misses = 0;
      const job = s.job;
      if (job.total) opts.onProgress(`Matching photos: ${job.processed} of ${job.total} (${job.uploaded} uploaded)`, 0.5 + (job.processed / job.total) * 0.5);
      else opts.onProgress("Reading the ZIP…", 0.5);
      if (job.status !== "processing") return job;
    } catch (e) {
      misses += 1;
      if (misses >= 5) throw new Error(errMsg(e, "Lost contact with the server. Check the records, then upload the ZIP again if needed."));
    }
  }
}
