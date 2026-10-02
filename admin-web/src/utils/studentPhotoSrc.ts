import api from "../api/client";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

const MAX_CONCURRENT = 4;
let active = 0;
const pending: Array<() => void> = [];

export type PhotoFetchOptions = {
  signal?: AbortSignal;
  thumb?: boolean;
};

function drain() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const run = pending.shift();
    run?.();
  }
}

function schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.push(() => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    });
    drain();
  });
}

/** Authenticated photo bytes. The stored URL is often not publicly readable. */
export function invalidateStudentPhotoCache(studentId: string): void {
  for (const key of [studentId, `t:${studentId}`, `sig:${studentId}`, `st:${studentId}`]) {
    const hit = cache.get(key);
    if (hit) URL.revokeObjectURL(hit);
    cache.delete(key);
    inflight.delete(key);
  }
}

async function fetchBlob(
  path: string,
  cacheKey: string,
  options?: PhotoFetchOptions
): Promise<string | null> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = schedule(async () => {
    const { data } = await api.get(path, {
      responseType: "blob",
      signal: options?.signal,
    });
    const url = URL.createObjectURL(data as Blob);
    cache.set(cacheKey, url);
    return url;
  }, options?.signal)
    .catch(() => null)
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, promise);
  return promise;
}

export async function authenticatedStudentPhotoUrl(
  studentId: string,
  options?: PhotoFetchOptions
): Promise<string | null> {
  const thumb = options?.thumb === true;
  const cacheKey = thumb ? `t:${studentId}` : studentId;
  const path = thumb
    ? `/admin/students/${studentId}/photo?thumb=1`
    : `/admin/students/${studentId}/photo`;
  return fetchBlob(path, cacheKey, options);
}

export async function authenticatedStudentSignatureUrl(
  studentId: string,
  options?: PhotoFetchOptions
): Promise<string | null> {
  const thumb = options?.thumb === true;
  const cacheKey = thumb ? `st:${studentId}` : `sig:${studentId}`;
  const path = thumb
    ? `/admin/students/${studentId}/signature?thumb=1`
    : `/admin/students/${studentId}/signature`;
  return fetchBlob(path, cacheKey, options);
}
