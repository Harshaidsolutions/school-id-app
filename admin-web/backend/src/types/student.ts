export type StudentStatus = "pending" | "printed" | "delivered" | string;

export interface Student {
  id: string;
  school_id: string | null;
  institute_id?: string | null;
  class_section: string;
  roll_no: string | null;
  student_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  address: string | null;
  photo_id: string | null;
  photo_url: string | null;
  photo_captured_at?: string | Date | null;
  photo_cropped?: boolean;
  signature_url?: string | null;
  status: string | null;
  import_batch_id: string | null;
  printed_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
  custom_1?: string | null;
  custom_2?: string | null;
  custom_3?: string | null;
  dob?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  extra_fields?: Record<string, string | null> | null;
  field_labels?: Record<string, string> | null;
}

export interface StudentRowInput {
  excelRow: number;
  photoId: string;
  classSection: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  address: string | null;
  rollNo: string | null;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  custom1: string | null;
  custom2: string | null;
  custom3: string | null;
  extraFields: Record<string, string | null>;
}

export interface RowValidationError {
  row: number;
  reason: string;
}

export interface ImportBatch {
  id: string;
  school_id: string | null;
  file_name: string | null;
  total_rows: number | null;
  success_count: number | null;
  error_count: number | null;
  uploaded_by: string | null;
  created_at: Date | null;
}

/** Required Excel headers (exact, case-insensitive after normalize). */
export const REQUIRED_EXCEL_HEADERS = [
  "PHOTO",
  "CLASS",
  "NAME",
  "PARENT",
  "PHONE",
] as const;

/** Optional Excel headers — missing column or blank cells are allowed. */
export const OPTIONAL_EXCEL_HEADERS = [
  "ADDRESS",
  "ROLL NO",
  "ROLL",
  "CUSTOM1",
  "CUSTOM2",
  "CUSTOM3",
] as const;
