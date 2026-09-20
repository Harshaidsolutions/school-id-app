import { Request, Response, NextFunction } from "express";
import { uploadSchoolAssets } from "./upload";

/** Run multer only for multipart uploads so JSON PUT bodies stay intact. */
export function optionalUploadSchoolAssets(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("multipart/form-data")) {
    uploadSchoolAssets(req, res, next);
    return;
  }
  next();
}
