import type { AuthUser } from "../types";

export function getAssignedClassSection(user: AuthUser | null): string | null {
  if (!user?.assignedClass) return null;
  return user.assignedSection
    ? `${user.assignedClass} ${user.assignedSection}`.trim()
    : user.assignedClass;
}

export function isSchoolWideTeacher(user: AuthUser | null): boolean {
  return Boolean(
    user?.role === "teacher" && user.schoolId && !user.assignedClass
  );
}
