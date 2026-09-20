import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth";
import {
  uploadExcel,
  uploadSchoolAssets,
  uploadStudentPhoto,
  uploadTemplateImageField,
} from "../middleware/upload";
import { optionalUploadSchoolAssets } from "../middleware/optionalUpload";
import {
  bulkUploadStudents,
  createStudentAdmin,
  deleteSchoolExcelData,
  deleteInstituteExcelData,
  deleteSchoolPhotosData,
  deleteInstitutePhotosData,
  deleteStudentAdmin,
  deleteStudentPhotoAdmin,
  uploadStudentPhotoAdmin,
  listStudentsAdmin,
  listStudentsBySchool,
  requestSchoolExcelDeleteOtp,
  requestInstituteExcelDeleteOtp,
  requestSchoolPhotosDeleteOtp,
  requestInstitutePhotosDeleteOtp,
  requestStudentDeleteOtp,
  updateStudentAdmin,
} from "../controllers/studentController";
import {
  downloadSchoolPhotosZip,
  downloadInstitutePhotosZip,
  downloadStudentPhoto,
  exportStudentsExcel,
  exportInstituteMembersExcel,
} from "../controllers/exportController";
import {
  createPrintBatch,
  listPrintBatches,
} from "../controllers/printBatchController";
import { runCleanupNow } from "../controllers/cleanupController";
import {
  createSchool,
  createSchoolWithOwner,
  deleteSchool,
  listSchools,
  requestSchoolDeleteOtp,
  updateSchool,
  setSchoolActive,
} from "../controllers/schoolController";
import {
  createInstitute,
  createInstituteWithOwner,
  deleteInstitute,
  listInstitutes,
  requestInstituteDeleteOtp,
  updateInstitute,
  setInstituteActive,
} from "../controllers/instituteController";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  listTemplatesBySchool,
  updateTemplate,
} from "../controllers/templateController";
import {
  createNotification,
  deleteNotification,
  listAdminNotifications,
  listAllAdminNotifications,
  requestNotificationDeleteOtp,
} from "../controllers/notificationController";
import { getDashboardSummary } from "../controllers/dashboardController";
import { getFormConfig, putFormConfig, syncFormConfig } from "../controllers/formConfigController";
import {
  getInstituteOrganizationInfo,
  getSchoolOrganizationInfo,
} from "../controllers/organizationInfoController";
import {
  createCatalogItem,
  deleteCatalogItem,
  listCatalogItems,
  updateCatalogItem,
} from "../controllers/catalogController";
import { uploadCatalogFile } from "../middleware/upload";

const router = Router();

router.use(authMiddleware, requireRole("admin"));

// Dashboard
router.get("/dashboard-summary", getDashboardSummary);

// Schools
router.post("/schools", uploadSchoolAssets, createSchool);
router.post("/schools-with-owner", createSchoolWithOwner);
router.get("/schools", listSchools);
router.patch("/schools/:id/active", setSchoolActive);
router.put("/schools/:id", optionalUploadSchoolAssets, updateSchool);
router.post("/schools/:id/request-delete-otp", requestSchoolDeleteOtp);
router.delete("/schools/:id", deleteSchool);
router.post("/schools/:schoolId/request-delete-excel-otp", requestSchoolExcelDeleteOtp);
router.post("/schools/:schoolId/request-delete-photos-otp", requestSchoolPhotosDeleteOtp);
router.delete("/schools/:schoolId/students", deleteSchoolExcelData);
router.delete("/schools/:schoolId/photos", deleteSchoolPhotosData);
router.get("/schools/:schoolId/download-photos", downloadSchoolPhotosZip);
router.get("/schools/:id/organization-info", getSchoolOrganizationInfo);

// Institutes
router.post("/institutes", uploadSchoolAssets, createInstitute);
router.post("/institutes-with-owner", createInstituteWithOwner);
router.get("/institutes", listInstitutes);
router.patch("/institutes/:id/active", setInstituteActive);
router.put("/institutes/:id", optionalUploadSchoolAssets, updateInstitute);
router.post("/institutes/:id/request-delete-otp", requestInstituteDeleteOtp);
router.delete("/institutes/:id", deleteInstitute);
router.get("/institutes/:instituteId/export-members", exportInstituteMembersExcel);
router.post("/institutes/:instituteId/request-delete-excel-otp", requestInstituteExcelDeleteOtp);
router.post("/institutes/:instituteId/request-delete-photos-otp", requestInstitutePhotosDeleteOtp);
router.delete("/institutes/:instituteId/students", deleteInstituteExcelData);
router.delete("/institutes/:instituteId/photos", deleteInstitutePhotosData);
router.get("/institutes/:instituteId/download-photos", downloadInstitutePhotosZip);
router.get("/institutes/:id/organization-info", getInstituteOrganizationInfo);

// Templates (global — shared by all schools)
router.post("/templates", uploadTemplateImageField, createTemplate);
router.get("/templates", listTemplates);
// Legacy path: schoolId ignored; returns all templates
router.get("/templates/:schoolId", listTemplatesBySchool);
router.put("/templates/:id", uploadTemplateImageField, updateTemplate);
router.delete("/templates/:id", deleteTemplate);

// Notifications
router.post("/notifications", createNotification);
router.get("/notifications", listAllAdminNotifications);
router.post("/notifications/:id/request-delete-otp", requestNotificationDeleteOtp);
router.delete("/notifications/:id", deleteNotification);
router.get("/notifications/:schoolId", listAdminNotifications);

// Students
router.get("/students", listStudentsAdmin);
router.post("/students", createStudentAdmin);
router.put("/students/:id", updateStudentAdmin);
router.post(
  "/students/bulk-upload",
  uploadExcel.single("file"),
  bulkUploadStudents
);
router.post("/students/:id/request-delete-otp", requestStudentDeleteOtp);
router.post(
  "/students/:id/photo",
  uploadStudentPhoto.single("photo"),
  uploadStudentPhotoAdmin
);
router.delete("/students/:id/photo", deleteStudentPhotoAdmin);
router.delete("/students/:id", deleteStudentAdmin);
router.get("/students/:studentId/photo", downloadStudentPhoto);
router.get("/students/:schoolId/export", exportStudentsExcel);
router.get("/students/:schoolId", listStudentsBySchool);

// Print batches
router.post("/print-batches", createPrintBatch);
router.get("/print-batches/:schoolId", listPrintBatches);

// Catalog (models, brochures, extra sections)
router.get("/catalog", listCatalogItems);
router.post("/catalog", uploadCatalogFile.single("file"), createCatalogItem);
router.put("/catalog/:id", uploadCatalogFile.single("file"), updateCatalogItem);
router.delete("/catalog/:id", deleteCatalogItem);

// Form setup (per school / institute)
router.get("/form-config", getFormConfig);
router.post("/form-config/sync", syncFormConfig);
router.put("/form-config", putFormConfig);

// Cleanup
router.post("/run-cleanup-now", runCleanupNow);

export default router;
