import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { YearProvider } from "./context/YearContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const StudentsPage = lazy(() => import("./pages/StudentsPage").then((module) => ({ default: module.StudentsPage })));
const BulkUploadPage = lazy(() => import("./pages/BulkUploadPage").then((module) => ({ default: module.BulkUploadPage })));
const SchoolFormPage = lazy(() => import("./pages/SchoolPages").then((module) => ({ default: module.SchoolFormPage })));
const SchoolListPage = lazy(() => import("./pages/SchoolPages").then((module) => ({ default: module.SchoolListPage })));
const InstituteFormPage = lazy(() => import("./pages/InstitutePages").then((module) => ({ default: module.InstituteFormPage })));
const InstituteListPage = lazy(() => import("./pages/InstitutePages").then((module) => ({ default: module.InstituteListPage })));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then((module) => ({ default: module.TemplatesPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const ModelsPage = lazy(() => import("./pages/ModelsPage").then((module) => ({ default: module.ModelsPage })));
const FormSetupPage = lazy(() => import("./pages/FormSetupPage").then((module) => ({ default: module.FormSetupPage })));
const CropToolPage = lazy(() => import("./pages/CropToolPage").then((module) => ({ default: module.CropToolPage })));
const OrganizationInfoPage = lazy(() => import("./pages/OrganizationInfoPage").then((module) => ({ default: module.OrganizationInfoPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const VerifyOtpPage = lazy(() => import("./pages/VerifyOtpPage").then((module) => ({ default: module.VerifyOtpPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const BrochuresPage = lazy(() => import("./pages/CatalogPages").then((module) => ({ default: module.BrochuresPage })));
const OrganizationDetailPage = lazy(() => import("./pages/OrganizationPortalPage").then((module) => ({ default: module.OrganizationDetailPage })));
const OrganizationPortalPage = lazy(() => import("./pages/OrganizationPortalPage").then((module) => ({ default: module.OrganizationPortalPage })));
const PublicOrgFormPage = lazy(() => import("./pages/PublicOrgFormPage").then((module) => ({ default: module.PublicOrgFormPage })));
const AdminManagementPage = lazy(() => import("./pages/AdminManagementPage").then((module) => ({ default: module.AdminManagementPage })));
const ChildAdminDetailPage = lazy(() => import("./pages/ChildAdminDetailPage").then((module) => ({ default: module.ChildAdminDetailPage })));

export default function App() {
  return (
    <AuthProvider>
      <YearProvider>
      <BrowserRouter>
        <Suspense fallback={<div role="status" className="p-6">Loading…</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/school-form/:token" element={<PublicOrgFormPage school />} />
          <Route path="/org-form/:token" element={<PublicOrgFormPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/schools" element={<SchoolListPage />} />
              <Route path="/schools/add" element={<SchoolFormPage />} />
              <Route path="/schools/:id/edit" element={<SchoolFormPage />} />
              <Route path="/institutes" element={<InstituteListPage />} />
              <Route path="/institutes/add" element={<InstituteFormPage />} />
              <Route path="/institutes/:id/edit" element={<InstituteFormPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/form-setup" element={<FormSetupPage />} />
              <Route path="/crop-tool" element={<CropToolPage />} />
              <Route path="/organization-info" element={<OrganizationInfoPage mode="organization" />} />
              <Route path="/school-info" element={<OrganizationInfoPage mode="school" />} />
              <Route path="/institute-info" element={<OrganizationInfoPage mode="institute" />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/brochures" element={<BrochuresPage />} />
              <Route path="/extra-1" element={<AdminManagementPage />} />
              <Route path="/extra-1/:id" element={<ChildAdminDetailPage />} />
              <Route path="/extra-2" element={<OrganizationPortalPage />} />
              <Route path="/extra-2/:id" element={<OrganizationDetailPage />} />
              <Route path="/students" element={<StudentsPage mode="school" />} />
              <Route path="/institute-members" element={<StudentsPage mode="institute" />} />
              <Route path="/bulk-upload" element={<BulkUploadPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </YearProvider>
    </AuthProvider>
  );
}
