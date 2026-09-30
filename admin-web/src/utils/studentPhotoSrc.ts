import api from "../api/client";

const cache = new Map<string, string>();

/** Authenticated photo bytes. The stored URL is often not publicly readable. */
export async function authenticatedStudentPhotoUrl(
  studentId: string
): Promise<string | null> {
  const hit = cache.get(studentId);
  if (hit) return hit;
  try {
    const { data } = await api.get(`/admin/students/${studentId}/photo`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(data as Blob);
    cache.set(studentId, url);
    return url;
  } catch {
    return null;
  }
}

export async function authenticatedStudentSignatureUrl(
  studentId: string
): Promise<string | null> {
  const key = `sig:${studentId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const { data } = await api.get(`/admin/students/${studentId}/signature`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(data as Blob);
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
