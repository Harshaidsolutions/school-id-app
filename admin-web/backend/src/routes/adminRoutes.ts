import {getSchoolParentLink, setSchoolParentFormEnabled,createSchoolParentLink} from "../controllers/schoolParentFormController";
import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth";
import {
  uploadExcel,
  uploadImage,
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
  bulkDeleteStudents,
  deleteStudentAdmin,
  deleteStudentPhotoAdmin,
  requestStudentBulkDeleteOtp,
  uploadStudentPhotoAdmin,
  uploadStudentSignatureAdmin,
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
  downloadStudentSignature,
  exportStudentsExcel,
  exportInstituteMembersExcel,
  listInstitutePhotoCaptureCounts,
  listSchoolPhotoCaptureCounts,
} from "../controllers/exportController";
import {
  createPrintBatch,
  listPrintBatches,
} from "../controllers/printBatchController";
import { runCleanupNow } from "../controllers/cleanupController";
import {
  createSchool,
  createSchoolWithOwner,
  bulkDeleteSchools,
  deleteSchool,
  listSchools,
  requestSchoolBulkDeleteOtp,
  requestSchoolDeleteOtp,
  updateSchool,
  setSchoolActive,
  setSchoolCapturePolicy,
} from "../controllers/schoolController";
import {
  createInstitute,
  createInstituteWithOwner,
  bulkDeleteInstitutes,
  deleteInstitute,
  listInstitutes,
  requestInstituteBulkDeleteOtp,
  requestInstituteDeleteOtp,
  updateInstitute,
  setInstituteActive,
  setInstituteCapturePolicy,
} from "../controllers/instituteController";
import {
  bulkDeleteTemplates,
  createTemplate,
  deleteTemplate,
  listTemplates,
  listTemplatesBySchool,
  updateTemplate,
} from "../controllers/templateController";
import {
  bulkDeleteNotifications,
  createNotification,
  deleteNotification,
  listAdminNotifications,
  requestNotificationBulkDeleteOtp,
  listAllAdminNotifications,
  incomingUnreadCount,
  markIncomingNotificationsRead,
  requestNotificationDeleteOtp,
} from "../controllers/notificationController";
import { getDashboardSummary } from "../controllers/dashboardController";
import { getFormConfig, putFormConfig, syncFormConfig } from "../controllers/formConfigController";
import {
  getInstituteOrganizationInfo,
  getSchoolOrganizationInfo,
  updateInstituteAppSettings,
  updateSchoolAppSettings,
} from "../controllers/organizationInfoController";
import {
  appendCatalogExtraImage,
  bulkDeleteCatalogItems,
  createCatalogItem,
  deleteCatalogItem,
  listCatalogItems,
  updateCatalogItem,
} from "../controllers/catalogController";
import { uploadCatalogFile, uploadCatalogMedia } from "../middleware/upload";
import {
  createOrganization,
  createOrganizationForm,
  deleteOrganization,
  deleteOrganizationSubmissions,
  downloadOrganizationExcel,
  downloadOrganizationPhotos,
  downloadOrganizationSubmissionPhoto,
  getOrganizationWorkspaceAdmin,
  bulkDeleteOrganizations,
  listOrganizations,
  requestOrganizationBulkDeleteOtp,
  requestOrganizationDeleteOtp,
  replaceOrganizationSubmissionPhoto,
  requestOrganizationSubmissionDeleteOtp,
  setOrganizationActive,
  setOrganizationCapturePolicy,
  updateOrganization,
  updateOrganizationDetails,
  updateOrganizationSubmissionAdmin,
  uploadOrganizationExcel,
} from "../controllers/organizationPortalController";
import {
  changeManagedAdminPassword,
  createManagedAdmin,
  deleteManagedAdmin,
  getAdminProfile,
  listManagedAdmins,
  requestManagedAdminDeleteOtp,
  requestManagedAdminPasswordOtp,
  updateManagedAdmin,
  uploadManagedAdminPhoto,
  setManagedAdminActive,
  getManagedAdminOverview,
} from "../controllers/adminUserController";

const router = Router();

router.use(authMiddleware, requireRole("admin"));

router.get("/profile", getAdminProfile);

router.get("/organizations", listOrganizations);
router.post("/organizations", createOrganization);
router.post("/organizations/bulk-delete/request-otp", requestOrganizationBulkDeleteOtp);
router.post("/organizations/bulk-delete", bulkDeleteOrganizations);
router.patch("/organizations/:id", updateOrganization);
router.patch("/organizations/:id/active", setOrganizationActive);
router.patch("/organizations/:id/capture", setOrganizationCapturePolicy);
router.post("/organizations/:id/request-delete-otp", requestOrganizationDeleteOtp);
router.delete("/organizations/:id", deleteOrganization);
router.post("/organizations/:id/submissions/bulk-delete/request-otp", requestOrganizationSubmissionDeleteOtp);
router.post("/organizations/:id/submissions/bulk-delete", deleteOrganizationSubmissions);
router.patch("/organizations/:id/submissions/:submissionId", updateOrganizationSubmissionAdmin);
router.get("/organizations/:id", getOrganizationWorkspaceAdmin);
router.post("/organizations/:id/forms", createOrganizationForm);
router.post("/organizations/:id/excel", uploadExcel.single("file"), uploadOrganizationExcel);
router.get("/organizations/:id/excel", downloadOrganizationExcel);
router.get("/organizations/:id/photos.zip", downloadOrganizationPhotos);
router.patch("/organizations/:id/details", updateOrganizationDetails);
router.post(
  "/organizations/:id/submissions/:submissionId/fields/:fieldId/photo",
  uploadStudentPhoto.single("photo"),
  replaceOrganizationSubmissionPhoto
);
router.get(
  "/organizations/:id/submissions/:submissionId/fields/:fieldId/photo",
  downloadOrganizationSubmissionPhoto
);

// Dashboard
router.get("/dashboard-summary", getDashboardSummary);

// Schools
router.get("/schools/:id/parent-link", getSchoolParentLink);
router.post("/schools/:id/parent-link", createSchoolParentLink);
router.patch("/schools/:id/parent-link/settings",setSchoolParentFormEnabled);
router.post("/schools", uploadSchoolAssets, createSchool);
router.post("/schools-with-owner", createSchoolWithOwner);
router.get("/schools", listSchools);
router.post("/schools/bulk-delete/request-otp", requestSchoolBulkDeleteOtp);
router.post("/schools/bulk-delete", bulkDeleteSchools);
router.patch("/schools/:id/active", setSchoolActive);
router.patch("/schools/:id/capture", setSchoolCapturePolicy);
router.put("/schools/:id", optionalUploadSchoolAssets, updateSchool);
router.post("/schools/:id/request-delete-otp", requestSchoolDeleteOtp);
router.delete("/schools/:id", deleteSchool);
router.post("/schools/:schoolId/request-delete-excel-otp", requestSchoolExcelDeleteOtp);
router.post("/schools/:schoolId/request-delete-photos-otp", requestSchoolPhotosDeleteOtp);
router.delete("/schools/:schoolId/students", deleteSchoolExcelData);
router.delete("/schools/:schoolId/photos", deleteSchoolPhotosData);
router.get("/schools/:schoolId/download-photos", downloadSchoolPhotosZip);
router.get("/schools/:schoolId/photo-capture-counts", listSchoolPhotoCaptureCounts);
router.patch("/schools/:id/app-settings", updateSchoolAppSettings);
router.get("/schools/:id/organization-info", (req,res,next) => getSchoolOrganizationInfo(req,res,next));
router.get("/organizations/:id/organization-info", (req,res,next) => getSchoolOrganizationInfo(req,res,next,true));

// Institutes
router.post("/institutes", uploadSchoolAssets, createInstitute);
router.post("/institutes-with-owner", createInstituteWithOwner);
router.get("/institutes", listInstitutes);
router.post("/institutes/bulk-delete/request-otp", requestInstituteBulkDeleteOtp);
router.post("/institutes/bulk-delete", bulkDeleteInstitutes);
router.patch("/institutes/:id/active", setInstituteActive);
router.patch("/institutes/:id/capture", setInstituteCapturePolicy);
router.put("/institutes/:id", optionalUploadSchoolAssets, updateInstitute);
router.post("/institutes/:id/request-delete-otp", requestInstituteDeleteOtp);
router.delete("/institutes/:id", deleteInstitute);
router.get("/institutes/:instituteId/export-members", exportInstituteMembersExcel);
router.post("/institutes/:instituteId/request-delete-excel-otp", requestInstituteExcelDeleteOtp);
router.post("/institutes/:instituteId/request-delete-photos-otp", requestInstitutePhotosDeleteOtp);
router.delete("/institutes/:instituteId/students", deleteInstituteExcelData);
router.delete("/institutes/:instituteId/photos", deleteInstitutePhotosData);
router.get("/institutes/:instituteId/download-photos", downloadInstitutePhotosZip);
router.get(
  "/institutes/:instituteId/photo-capture-counts",
  listInstitutePhotoCaptureCounts
);
router.patch("/institutes/:id/app-settings", updateInstituteAppSettings);
router.get("/institutes/:id/organization-info", getInstituteOrganizationInfo);

// Templates (global — shared by all schools)
router.post("/templates/bulk-delete", bulkDeleteTemplates);
router.post("/templates", uploadTemplateImageField, createTemplate);
router.get("/templates", listTemplates);
// Legacy path: schoolId ignored; returns all templates
router.get("/templates/:schoolId", listTemplatesBySchool);
router.put("/templates/:id", uploadTemplateImageField, updateTemplate);
router.delete("/templates/:id", deleteTemplate);

// Notifications
router.post("/notifications/bulk-delete/request-otp", requestNotificationBulkDeleteOtp);
router.post("/notifications/bulk-delete", bulkDeleteNotifications);
router.post("/notifications", uploadImage.single("image"), createNotification);
router.get("/notifications", listAllAdminNotifications);
router.get("/notifications/unread-count", incomingUnreadCount);
router.post("/notifications/incoming/mark-read", markIncomingNotificationsRead);
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
router.post("/students/bulk-delete/request-otp", requestStudentBulkDeleteOtp);
router.post("/students/bulk-delete", bulkDeleteStudents);
router.post("/students/:id/request-delete-otp", requestStudentDeleteOtp);
router.post(
  "/students/:id/photo",
  uploadStudentPhoto.single("photo"),
  uploadStudentPhotoAdmin
);
router.post(
  "/students/:id/signature",
  uploadStudentPhoto.single("signature"),
  uploadStudentSignatureAdmin
);
router.delete("/students/:id/photo", deleteStudentPhotoAdmin);
router.delete("/students/:id", deleteStudentAdmin);
router.get("/students/:studentId/photo", downloadStudentPhoto);
router.get("/students/:studentId/signature", downloadStudentSignature);
router.get("/students/:schoolId/export", exportStudentsExcel);
router.get("/students/:schoolId", listStudentsBySchool);

// Print batches
router.post("/print-batches", createPrintBatch);
router.get("/print-batches/:schoolId", listPrintBatches);

// Catalog (models, brochures, extra sections)
router.get("/catalog", listCatalogItems);
router.post("/catalog/bulk-delete", bulkDeleteCatalogItems);
router.post(
  "/catalog",
  uploadCatalogMedia.fields([
    { name: "file", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  createCatalogItem
);
router.put(
  "/catalog/:id",
  uploadCatalogMedia.fields([
    { name: "file", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  updateCatalogItem
);
router.post(
  "/catalog/:id/extra-images",
  uploadCatalogFile.single("file"),
  appendCatalogExtraImage
);
router.delete("/catalog/:id", deleteCatalogItem);

// Form setup (per school / institute)
router.get("/form-config", getFormConfig);
router.post("/form-config/sync", syncFormConfig);
router.put("/form-config", putFormConfig);

// Cleanup
router.post("/run-cleanup-now", runCleanupNow);

// Super admin — managed admin accounts
router.get("/managed-admins", listManagedAdmins);
router.get("/managed-admins/:id/overview", getManagedAdminOverview);
router.post("/managed-admins", createManagedAdmin);
router.put("/managed-admins/:id", updateManagedAdmin);
router.patch("/managed-admins/:id/active", setManagedAdminActive);
router.post("/managed-admins/:id/request-delete-otp", requestManagedAdminDeleteOtp);
router.post("/managed-admins/:id/delete", deleteManagedAdmin);
router.post("/managed-admins/:id/request-password-otp", requestManagedAdminPasswordOtp);
router.post("/managed-admins/:id/password", changeManagedAdminPassword);
router.post(
  "/managed-admins/:id/photo",
  uploadStudentPhoto.single("photo"),
  uploadManagedAdminPhoto
);

export default router;
