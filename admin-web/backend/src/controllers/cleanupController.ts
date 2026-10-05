import { Request, Response, NextFunction } from "express";
import { requireSuperAdmin } from "../utils/adminScope";
import { runPhotoCleanup } from "../jobs/photoCleanup";

export async function runCleanupNow(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const result = await runPhotoCleanup();
    res.status(200).json({
      success: true,
      scanned: result.scanned,
      deleted: result.deleted,
      failures: result.failures,
    });
  } catch (error) {
    next(error);
  }
}
