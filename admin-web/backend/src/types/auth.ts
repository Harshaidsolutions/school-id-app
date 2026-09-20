export type UserRole = "admin" | "teacher" | "institute_staff";

export interface User {
  id: string;
  email: string;
  username: string | null;
  password_hash: string;
  role: UserRole;
  school_id: string | null;
  institute_id: string | null;
  assigned_class: string | null;
  assigned_section: string | null;
  created_at: Date;
}

export interface JWTPayload {
  userId: string;
  role: UserRole;
  schoolId: string | null;
  instituteId?: string | null;
  assignedClass: string | null;
  assignedSection: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  schoolId: string;
  assignedClass?: string | null;
  assignedSection?: string | null;
}

export interface AuthUser {
  userId: string;
  role: UserRole;
  schoolId: string | null;
  instituteId?: string | null;
  assignedClass: string | null;
  assignedSection: string | null;
}
