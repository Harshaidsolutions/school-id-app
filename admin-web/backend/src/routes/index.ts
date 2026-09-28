import { Router } from "express";
import { healthCheck } from "../controllers/healthController";
import { getPublicShowcase, submitPublicEnquiry } from "../controllers/publicSiteController";
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
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/teacher", teacherRoutes);

export default router;