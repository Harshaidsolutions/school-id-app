import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { YearProvider } from "./context/YearContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StudentsPage } from "./pages/StudentsPage";
import { BulkUploadPage } from "./pages/BulkUploadPage";
import { SchoolFormPage, SchoolListPage } from "./pages/SchoolPages";
import { InstituteFormPage, InstituteListPage } from "./pages/InstitutePages";
import { TemplatesPage } from "./pages/TemplatesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ModelsPage } from "./pages/ModelsPage";
import { FormSetupPage } from "./pages/FormSetupPage";
import { CropToolPage } from "./pages/CropToolPage";
import { OrganizationInfoPage } from "./pages/OrganizationInfoPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { VerifyOtpPage } from "./pages/VerifyOtpPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { BrochuresPage } from "./pages/CatalogPages";
import { OrganizationDetailPage, OrganizationPortalPage } from "./pages/OrganizationPortalPage";
import { PublicOrgFormPage } from "./pages/PublicOrgFormPage";
import { AdminManagementPage } from "./pages/AdminManagementPage";
import { ChildAdminDetailPage } from "./pages/ChildAdminDetailPage";

export default function App() {
  return (
    <AuthProvider>
      <YearProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
      </BrowserRouter>
      </YearProvider>
    </AuthProvider>
  );
}
