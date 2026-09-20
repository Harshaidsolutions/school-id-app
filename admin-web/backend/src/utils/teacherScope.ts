import { AuthUser } from "../types/auth";
import { AppError } from "../middleware/errorHandler";

export interface ScopedResource {
  schoolId: string;
  classSection: string;
}

export function combineClassSection(
  className: string | null | undefined,
  section: string | null | undefined
): string {
  const c = (className ?? "").trim();
  const s = (section ?? "").trim();
  if (!c) return s;
  return s ? `${c} ${s}` : c;
}

export function normalizeClassSection(value: string): string {
  return value.trim().toLowerCase();
}

/** School owners often have school_id but no single class/section assignment. */
export function isSchoolWideTeacher(user: AuthUser): boolean {
  return (
    user.role === "teacher" && Boolean(user.schoolId) && !user.assignedClass
  );
}

export function getTeacherAssignedClassSection(user: AuthUser): string {
  return combineClassSection(user.assignedClass, user.assignedSection);
}

/**
 * Ensures a teacher can only access data for their own school_id,
 * and (when class-scoped) their assigned class_section.
 * School-wide teachers may access any class_section in their school.
 */
export function assertTeacherScope(
  user: AuthUser,
  resource: ScopedResource
): void {
  if (user.role !== "teacher") {
    return;
  }

  if (!user.schoolId) {
    throw new AppError("Teacher account is missing school assignment", 403);
  }

  if (user.schoolId !== resource.schoolId) {
    throw new AppError(
      "Access denied: you can only access data for your own school",
      403
    );
  }

  if (isSchoolWideTeacher(user)) {
    return;
  }

  const assigned = getTeacherAssignedClassSection(user);
  if (!assigned) {
    throw new AppError("Teacher account is missing class assignment", 403);
  }

  if (
    normalizeClassSection(assigned) !==
    normalizeClassSection(resource.classSection)
  ) {
    throw new AppError(
      "Access denied: you can only access data for your assigned class",
      403
    );
  }
}

/**
 * Returns the school / class_section filter a class-scoped teacher must use.
 */
export function getTeacherDataFilter(user: AuthUser): {
  schoolId: string;
  classSection: string;
} {
  if (user.role !== "teacher") {
    throw new AppError(
      "Teacher data filter only applies to teacher accounts",
      403
    );
  }

  if (!user.schoolId) {
    throw new AppError("Teacher account is missing school assignment", 403);
  }

  const classSection = getTeacherAssignedClassSection(user);
  if (!classSection) {
    throw new AppError(
      "Teacher account is missing class or section assignment",
      403
    );
  }

  return {
    schoolId: user.schoolId,
    classSection,
  };
}

export function getTeacherSchoolId(user: AuthUser): string {
  if (user.role !== "teacher") {
    throw new AppError("Teacher school id only applies to teacher accounts", 403);
  }
  if (!user.schoolId) {
    throw new AppError("Teacher account is missing school assignment", 403);
  }
  return user.schoolId;
}

/** Resolve class_section from query: prefer classSection, else class (+ optional section). */
export function resolveClassSectionQuery(query: RequestQueryLike): string {
  const classSection =
    typeof query.classSection === "string"
      ? query.classSection.trim()
      : typeof query.class_section === "string"
        ? query.class_section.trim()
        : "";
  if (classSection) return classSection;

  const className =
    typeof query.class === "string" ? query.class.trim() : "";
  const section =
    typeof query.section === "string" ? query.section.trim() : "";
  return combineClassSection(className, section);
}

type RequestQueryLike = Record<string, unknown>;
