import { limitAuthAttempts } from "../middleware/attemptLimit";
import { Router } from "express";
import {
  login,
  register,
  setupFirstAdmin,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getSuperAdminContacts,
} from "../controllers/authController";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

router.post("/login", limitAuthAttempts, login);
router.get("/support-contacts", getSuperAdminContacts);
/** One-time bootstrap only — refuses once any admin exists */
router.post("/setup-first-admin", limitAuthAttempts, setupFirstAdmin);
/** Teachers (and additional users) may only be created by an authenticated admin */
router.post("/register", authMiddleware, requireRole("admin"), register);

/** Password recovery */
router.post("/forgot-password", limitAuthAttempts, forgotPassword);
router.post("/verify-reset-otp", limitAuthAttempts, verifyResetOtp);
router.post("/reset-password", limitAuthAttempts, resetPassword);

export default router;
