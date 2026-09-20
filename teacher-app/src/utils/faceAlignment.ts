import type { Bounds } from "react-native-vision-camera-face-detector";

export type OvalGuide = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

/**
 * True when a single face sits well inside the oval guide
 * (centered + sized for an ID photo).
 */
export function isFaceAlignedInOval(
  bounds: Bounds,
  oval: OvalGuide,
  opts?: {
    minWidthRatio?: number;
    maxWidthRatio?: number;
    inset?: number;
  }
): boolean {
  const minWidthRatio = opts?.minWidthRatio ?? 0.42;
  const maxWidthRatio = opts?.maxWidthRatio ?? 0.98;
  const inset = opts?.inset ?? 0.08;

  const faceCenterX = bounds.x + bounds.width / 2;
  const faceCenterY = bounds.y + bounds.height / 2;

  const rx = (oval.width / 2) * (1 - inset);
  const ry = (oval.height / 2) * (1 - inset);
  if (rx <= 0 || ry <= 0) return false;

  const nx = (faceCenterX - oval.centerX) / rx;
  const ny = (faceCenterY - oval.centerY) / ry;
  const centerInside = nx * nx + ny * ny <= 1;

  const widthRatio = bounds.width / oval.width;
  const sizeOk = widthRatio >= minWidthRatio && widthRatio <= maxWidthRatio;

  return centerInside && sizeOk;
}
