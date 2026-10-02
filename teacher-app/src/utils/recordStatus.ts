import type { TeacherStudent } from "../types";

export function studentHasPhoto(student: TeacherStudent): boolean {
  if (typeof student.pending_photo === "boolean") return !student.pending_photo;
  return Boolean(student.photo_url?.trim());
}

export function studentPendingData(
  student: TeacherStudent,
  institute: boolean
): boolean {
  if (typeof student.pending_data === "boolean") return student.pending_data;
  if (!student.student_name?.trim()) return true;
  if (!institute && !student.class_section?.trim()) return true;
  return false;
}

export function studentFullyCaptured(
  student: TeacherStudent,
  institute: boolean
): boolean {
  if (typeof student.fully_captured === "boolean") return student.fully_captured;
  return studentHasPhoto(student) && !studentPendingData(student, institute);
}

/** Display the stored capture timestamp in India time, matching the admin website and Excel. */
export function formatCapturedAt(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = read("day");
  const month = read("month");
  const year = read("year");
  const hour = read("hour");
  const minute = read("minute");
  const dayPeriod = read("dayPeriod").toUpperCase();
  if (!day || !month || !year || !hour || !minute) return null;
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}
