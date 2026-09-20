export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  role: "admin" | "teacher" | "institute_staff";
  schoolId: string | null;
  instituteId?: string | null;
  assignedClass: string | null;
  assignedSection: string | null;
}

export interface LoginResponse {
  status: string;
  token: string;
  user: AuthUser;
}

export interface TeacherStudent {
  id: string;
  student_name: string;
  roll_no: string | null;
  photo_url: string | null;
  /** ISO timestamp when the student photo was last successfully captured/uploaded. */
  photo_captured_at?: string | null;
  status: string | null;
  class_section?: string | null;
  dob?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  address?: string | null;
  photo_id?: string | null;
  custom_1?: string | null;
  custom_2?: string | null;
  custom_3?: string | null;
  extra_fields?: Record<string, string | null> | null;
  dynamic_fields?: Record<string, string | null> | null;
  field_labels?: Record<string, string> | null;
}

export interface StudentsResponse {
  status: string;
  count: number;
  students: TeacherStudent[];
}

export interface ProgressResponse {
  totalStudents: number;
  captured: number;
  uncaptured: number;
}

export interface TeacherHomeResponse {
  status: string;
  orgType?: "school" | "institute";
  schoolName: string;
  schoolLogoUrl?: string | null;
  overall: ProgressResponse;
  classes: {
    class_section: string;
    totalStudents: number;
    captured: number;
    uncaptured: number;
  }[];
}

export interface TemplateItem {
  id: string;
  school_id: string | null;
  name: string;
  orientation: string | null;
  image_url: string | null;
  config_json: unknown;
  created_at: string | null;
}

export interface TemplatesResponse {
  status: string;
  count: number;
  selectedTemplateId: string | null;
  templates: TemplateItem[];
}

export interface NotificationItem {
  id: string;
  school_id: string | null;
  title: string;
  message: string;
  created_by: string | null;
  created_at: string | null;
  is_read?: boolean;
}

export interface NotificationsResponse {
  status: string;
  count: number;
  unreadCount: number;
  notifications: NotificationItem[];
}

export interface CardPreviewResponse {
  status: string;
  student: TeacherStudent;
  previewUrl: string;
  previewBase64: string;
}

export interface TeacherModel {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string | null;
}

export interface ApiErrorBody {
  status?: string;
  message?: string;
}

export const TEMPLATE_TABS = [
  { key: "vertical_single", label: "Vertical – Single Side" },
  { key: "vertical_both", label: "Vertical – Both Side" },
  { key: "horizontal_both", label: "Horizontal – Both Side" },
  { key: "horizontal_single", label: "Horizontal – Single Side" },
  { key: "staff_id", label: "Staff ID Card" },
] as const;

export const MODEL_TABS = [
  { key: "id_cards", label: "ID Card Models" },
  { key: "tags", label: "ID Card Tags" },
] as const;

export const MODEL_CATEGORY: Record<string, "id_cards" | "tags"> = {
  "ID Cards": "id_cards",
  Belts: "tags",
  Ties: "tags",
  Diaries: "tags",
  "Progress Cards": "id_cards",
  Certificates: "id_cards",
  "Student Files": "id_cards",
  "Rank Badges": "tags",
  "Cloth Badges": "tags",
  "Key Chains": "tags",
  "Book Covers": "tags",
};

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
