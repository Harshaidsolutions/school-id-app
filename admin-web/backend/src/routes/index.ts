import { Router } from "express";
import { healthCheck } from "../controllers/healthController";
import { getPublicShowcase, submitPublicEnquiry } from "../controllers/publicSiteController";
import {
  downloadOrganizationAppPhoto,
  getOrganizationAppWorkspace,
  getPublicOrganizationForm,
  submitPublicOrganizationForm,
  updateOrganizationAppSubmission,
} from "../controllers/organizationPortalController";
import { getTeacherBranding } from "../controllers/customerBrandController";
import { authMiddleware, requireRole } from "../middleware/auth";
import { uploadStudentPhoto } from "../middleware/upload";
import authRoutes from "./authRoutes";
import adminRoutes from "./adminRoutes";
import teacherRoutes from "./teacherRoutes";

/**
 * Mounted at /api in src/index.ts.
 * Effective paths: /api/health, /api/auth/*, /api/admin/*, /api/teacher/*
 */
const router = Router();

router.get("/health", healthCheck);
router.get("/public/showcase", getPublicShowcase);
router.post("/public/enquiry", submitPublicEnquiry);
router.get("/public/org-forms/:token", getPublicOrganizationForm);
router.post(
  "/public/org-forms/:token",
  uploadStudentPhoto.any(),
  submitPublicOrganizationForm
);
router.get(
  "/organization-app/branding",
  authMiddleware,
  requireRole("organization_staff"),
  getTeacherBranding
);
router.get(
  "/organization-app",
  authMiddleware,
  requireRole("organization_staff"),
  getOrganizationAppWorkspace
);
router.patch(
  "/organization-app/submissions/:submissionId",
  authMiddleware,
  requireRole("organization_staff"),
  updateOrganizationAppSubmission
);
router.get(
  "/organization-app/submissions/:submissionId/fields/:fieldId/photo",
  authMiddleware,
  requireRole("organization_staff"),
  downloadOrganizationAppPhoto
);
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/teacher", teacherRoutes);

export default router;