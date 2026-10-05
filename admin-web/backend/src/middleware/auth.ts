import { createHmac } from "node:crypto";
import { pool } from "../config/database";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler";
import { AuthUser, JWTPayload, UserRole } from "../types/auth";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("JWT_SECRET is not configured", 500);
  }
  return secret;
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw new AppError("Missing or invalid Authorization header", 401);
    }

    const token = header.slice(7).trim();
    if (!token) {
      throw new AppError("Missing or invalid Authorization header", 401);
    }

    const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;

    if (!decoded.userId || !decoded.role) {
      throw new AppError("Invalid token payload", 401);
    }

    const result = await pool.query<{
      role: UserRole; school_id: string | null; institute_id: string | null;
      organization_id: string | null; assigned_class: string | null;
      assigned_section: string | null; is_super_admin: boolean; is_active: boolean;
      password_hash: string;
    }>(`SELECT role, school_id, institute_id, organization_id, assigned_class,
               assigned_section, is_super_admin, is_active, password_hash
        FROM users WHERE id = $1::uuid LIMIT 1`, [decoded.userId]);
    const current = result.rows[0];
    if (!current || current.is_active === false || current.role !== decoded.role ||
        decoded.credentialVersion !== credentialVersion(current.password_hash)) {
      throw new AppError("Session expired. Please sign in again.", 401);
    }
    const user: AuthUser = {
      userId: decoded.userId,
      role: current.role,
      schoolId: current.school_id,
      instituteId: current.institute_id,
      organizationId: current.organization_id,
      assignedClass: current.assigned_class,
      assignedSection: current.assigned_section,
      isSuperAdmin: current.is_super_admin === true,
    };

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError("Token expired", 401));
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError("Invalid token", 401));
      return;
    }

    next(error);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError("Authentication required", 401));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError("Forbidden: insufficient permissions", 403));
      return;
    }

    next();
  };
}

export function signAuthToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/** Password changes invalidate previously issued tokens without exposing a password hash. */
export function credentialVersion(passwordHash: string): string {
  return createHmac("sha256", getJwtSecret()).update(passwordHash).digest("hex");
}
