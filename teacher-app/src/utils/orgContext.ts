import type { AuthUser } from "../types";

export function isInstituteUser(user: AuthUser | null | undefined): boolean {
  return user?.role === "institute_staff" || Boolean(user?.instituteId);
}
