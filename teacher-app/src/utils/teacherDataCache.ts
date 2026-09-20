import type { TeacherHomeResponse, TeacherStudent } from "../types";

const STALE_MS = 20_000;

let homeCache: { data: TeacherHomeResponse; ts: number } | null = null;
const studentsCache = new Map<
  string,
  { students: TeacherStudent[]; ts: number }
>();

export function getCachedTeacherHome(): TeacherHomeResponse | null {
  if (!homeCache) return null;
  if (Date.now() - homeCache.ts > STALE_MS) return null;
  return homeCache.data;
}

export function setCachedTeacherHome(data: TeacherHomeResponse) {
  homeCache = { data, ts: Date.now() };
}

export function invalidateTeacherHomeCache() {
  homeCache = null;
}

export function getCachedStudents(classSection: string): TeacherStudent[] | null {
  const entry = studentsCache.get(classSection);
  if (!entry) return null;
  if (Date.now() - entry.ts > STALE_MS) return null;
  return entry.students;
}

export function setCachedStudents(
  classSection: string,
  students: TeacherStudent[]
) {
  studentsCache.set(classSection, { students, ts: Date.now() });
}

export function invalidateStudentsCache(classSection?: string) {
  if (classSection) studentsCache.delete(classSection);
  else studentsCache.clear();
}
