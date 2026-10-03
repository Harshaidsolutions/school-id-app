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

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
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

    const user: AuthUser = {
      userId: decoded.userId,
      role: decoded.role,
      schoolId: decoded.schoolId ?? null,
      instituteId: decoded.instituteId ?? null,
      organizationId: decoded.organizationId ?? null,
      assignedClass: decoded.assignedClass ?? null,
      assignedSection: decoded.assignedSection ?? null,
      isSuperAdmin: decoded.isSuperAdmin === true,
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

    next(new AppError("Authentication failed", 401));
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
