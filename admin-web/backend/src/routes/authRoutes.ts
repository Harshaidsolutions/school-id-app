import { Router } from "express";
import {
  login,
  register,
  setupFirstAdmin,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../controllers/authController";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

router.post("/login", login);
/** One-time bootstrap only — refuses once any admin exists */
router.post("/setup-first-admin", setupFirstAdmin);
/** Teachers (and additional users) may only be created by an authenticated admin */
router.post("/register", authMiddleware, requireRole("admin"), register);

/** Password recovery */
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

export default router;
