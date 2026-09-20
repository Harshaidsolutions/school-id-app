import { AppError } from "../middleware/errorHandler";
import type { AuthUser } from "../types/auth";

export type TeacherOrgKind = "school" | "institute";

export function isInstituteStaff(user: AuthUser): boolean {
  return user.role === "institute_staff" && Boolean(user.instituteId);
}

export function getTeacherOrgKind(user: AuthUser): TeacherOrgKind {
  if (isInstituteStaff(user)) return "institute";
  return "school";
}

export function getTeacherOrgId(user: AuthUser): string {
  if (isInstituteStaff(user)) {
    if (!user.instituteId) {
      throw new AppError(
        "Institute account is not linked to an institute. Please contact the administrator.",
        403
      );
    }
    return user.instituteId;
  }
  if (!user.schoolId) {
    throw new AppError(
      "Teacher account is not linked to a school. Please contact the administrator.",
      403
    );
  }
  return user.schoolId;
}

export function assertStudentBelongsToOrg(
  user: AuthUser,
  student: { school_id?: string | null; institute_id?: string | null }
): void {
  if (isInstituteStaff(user)) {
    if (student.institute_id !== user.instituteId) {
      throw new AppError("Forbidden: member belongs to another institute", 403);
    }
    return;
  }
  if (student.school_id !== user.schoolId) {
    throw new AppError("Forbidden: student belongs to another school", 403);
  }
}
