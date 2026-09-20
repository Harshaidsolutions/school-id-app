import { Request, Response, NextFunction } from "express";
import { runPhotoCleanup } from "../jobs/photoCleanup";

export async function runCleanupNow(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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
