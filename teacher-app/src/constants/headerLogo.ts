import { wp } from "../theme/responsive";

/** Login screen — reference v1.0.62 (unchanged proportions). */
export function loginLogoSize(width: number): number {
  return wp(28, width);
}

/** Home header — compact icon on orange bar. */
export function headerLogoSize(width: number): number {
  return wp(11, width);
}

/** Sidebar drawer — slightly smaller than home header. */
export function drawerLogoSize(width: number): number {
  return wp(9.5, width);
}

/** Splash intro — larger centered logo. */
export function splashLogoSize(width: number): number {
  return wp(32, width);
}

/** @deprecated use loginLogoSize(width) — kept for imports that expect a constant */
export const LOGIN_LOGO_SIZE = wp(28);

/** @deprecated use headerLogoSize(width) */
export const HEADER_LOGO_SIZE = wp(11);

/** @deprecated use drawerLogoSize(width) */
export const DRAWER_LOGO_SIZE = wp(9.5);
