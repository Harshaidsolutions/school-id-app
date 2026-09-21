export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  role: "admin" | "teacher";
  schoolId: string | null;
  assignedClass: string | null;
  assignedSection: string | null;
  displayName?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  isSuperAdmin?: boolean;
}

export interface LoginResponse {
  status: string;
  token: string;
  user: AuthUser;
}

export interface Student {
  id: string;
  school_id: string | null;
  class_section: string | null;
  roll_no: string | null;
  student_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  address: string | null;
  photo_id: string | null;
  photo_url: string | null;
  status: string | null;
  custom_1?: string | null;
  custom_2?: string | null;
  custom_3?: string | null;
  dob?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  extra_fields?: Record<string, string | null> | null;
  field_labels?: Record<string, string> | null;
  institute_id?: string | null;
  import_batch_id: string | null;
  printed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudentsResponse {
  status: string;
  count: number;
  students: Student[];
}

export interface BulkUploadSuccess {
  success: true;
  imported: number;
  inserted?: number;
  updated?: number;
  replaced?: boolean;
  importBatchId: string;
}

export interface BulkUploadErrorItem {
  row: number;
  reason: string;
}

export interface BulkUploadFailure {
  success: false;
  errors: BulkUploadErrorItem[];
}

export type BulkUploadResponse = BulkUploadSuccess | BulkUploadFailure;

export interface ApiErrorBody {
  status?: string;
  message?: string;
}

export interface DashboardSummary {
  status: string;
  year: string | null;
  totalSchools: number;
  activeSchools?: number;
  inactiveSchools?: number;
  totalStudents: number;
  totalCaptured: number;
  totalUncaptured: number;
  schoolPhotos?: number;
  schoolCaptured?: number;
  schoolPending?: number;
  institutePhotos?: number;
  instituteCaptured?: number;
  institutePending?: number;
  totalInstitutes: number;
  activeInstitutes?: number;
  inactiveInstitutes?: number;
  totalTemplates?: number;
  totalModels?: number;
  overview?: { day: string; schools: number; institutes: number }[];
  recentActivity?: { kind: string; title: string; created_at: string }[];
}

export interface CatalogItem {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  image_url: string | null;
  extra_image_urls?: string[] | null;
  file_size: number | null;
  created_at: string | null;
}

export interface School {
  id: string;
  name: string;
  year: string | null;
  phone: string | null;
  school_code: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  template_id: string | null;
  created_at: string | null;
  /** Owner teacher username (from schools-with-owner join) */
  owner_username?: string | null;
  owner_user_id?: string | null;
  owner_password?: string | null;
  /** Active/Inactive — defaults to true when API omits it */
  is_active?: boolean | null;
}

export interface Institute {
  id: string;
  name: string;
  year: string | null;
  phone: string | null;
  institute_code: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  created_at: string | null;
  owner_username?: string | null;
  owner_user_id?: string | null;
  owner_password?: string | null;
  is_active?: boolean | null;
}

export type TemplateOrientation =
  | "vertical_single"
  | "vertical_both"
  | "horizontal_single"
  | "horizontal_both"
  | "staff_id";

export interface Template {
  id: string;
  school_id: string | null;
  name: string;
  orientation: TemplateOrientation | string | null;
  config_json: unknown;
  image_url: string | null;
  created_at: string | null;
}

export interface NotificationItem {
  id: string;
  school_id: string | null;
  institute_id?: string | null;
  title: string;
  message: string;
  created_by: string | null;
  created_at: string | null;
  school_name?: string | null;
  institute_name?: string | null;
}

export const TEMPLATE_TABS: {
  key: TemplateOrientation;
  label: string;
}[] = [
  { key: "vertical_single", label: "Vertical – Single Side" },
  { key: "vertical_both", label: "Vertical – Both Side" },
  { key: "horizontal_both", label: "Horizontal – Both Side" },
  { key: "horizontal_single", label: "Horizontal – Single Side" },
  { key: "staff_id", label: "Staff ID Card" },
];

export const PRODUCT_MODELS = [
  "ID Cards",
  "Belts",
  "Ties",
  "Diaries",
  "Progress Cards",
  "Certificates",
  "Student Files",
  "Rank Badges",
  "Cloth Badges",
  "Key Chains",
  "Book Covers",
] as const;
