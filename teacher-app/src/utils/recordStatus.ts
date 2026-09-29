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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Display the stored capture timestamp. Returns null when it is missing or invalid. */
export function formatCapturedAt(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hour12}:${minutes} ${ampm}`;
}
