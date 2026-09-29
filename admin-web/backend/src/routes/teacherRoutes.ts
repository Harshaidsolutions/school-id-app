import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requireActiveTeacherOrg } from "../middleware/orgAccess";
import { optionalUploadSchoolAssets } from "../middleware/optionalUpload";
import { uploadStudentPhoto as photoUpload } from "../middleware/upload";
import {
  deleteStudentPhoto,
  createTeacherStudent,
  getTeacherHome,
  listTeacherModels,
  getTeacherProgress,
  getTeacherFormConfig,
  listTeacherStudents,
  updateTeacherStudent,
  uploadMemberSignature,
  uploadStudentPhoto,
} from "../controllers/teacherController";
import {
  listTeacherTemplates,
  selectTeacherTemplate,
} from "../controllers/templateController";
import {
  deleteAllTeacherNotifications,
  deleteTeacherNotification,
  listTeacherNotifications,
  markTeacherNotificationRead,
} from "../controllers/notificationController";
import {
  registerTeacherPushToken,
  unregisterTeacherPushToken,
} from "../controllers/pushTokenController";
import { getTeacherCardPreview } from "../controllers/cardPreviewController";
import {
  getTeacherOrganization,
  updateTeacherOrganization,
} from "../controllers/organizationController";
import { getLatestTeacherBrochure, listTeacherBrochures } from "../controllers/catalogController";
import { getTeacherBranding } from "../controllers/customerBrandController";

const router = Router();

router.use(
  authMiddleware,
  requireRole("teacher", "institute_staff"),
  requireActiveTeacherOrg
);

router.get("/home", getTeacherHome);
router.get("/branding", getTeacherBranding);
router.get("/form-config", getTeacherFormConfig);
router.get("/organization", getTeacherOrganization);
router.put("/organization", optionalUploadSchoolAssets, updateTeacherOrganization);

router.get("/students", listTeacherStudents);
router.post("/students", createTeacherStudent);
router.put("/students/:id", updateTeacherStudent);
router.post(
  "/students/:id/photo",
  photoUpload.single("photo"),
  uploadStudentPhoto
);
router.post(
  "/students/:id/signature",
  photoUpload.single("signature"),
  uploadMemberSignature
);
router.delete("/students/:id/photo", deleteStudentPhoto);
router.get("/students/:id/card-preview", getTeacherCardPreview);
router.get("/progress", getTeacherProgress);

router.get("/templates", listTeacherTemplates);
router.post("/templates/:id/select", selectTeacherTemplate);
router.get("/models", listTeacherModels);

router.get("/notifications", listTeacherNotifications);
router.post("/notifications/delete-all", deleteAllTeacherNotifications);
router.post("/notifications/:id/read", markTeacherNotificationRead);
router.post("/notifications/:id/delete", deleteTeacherNotification);
router.post("/push-token", registerTeacherPushToken);
router.delete("/push-token", unregisterTeacherPushToken);
router.get("/brochures", listTeacherBrochures);
router.get("/brochure", getLatestTeacherBrochure);

export default router;
