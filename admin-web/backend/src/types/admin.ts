export type TemplateOrientation =
  | "vertical_single"
  | "vertical_both"
  | "horizontal_single"
  | "horizontal_both"
  | "staff_id";

export const TEMPLATE_ORIENTATIONS: TemplateOrientation[] = [
  "vertical_single",
  "vertical_both",
  "horizontal_single",
  "horizontal_both",
  "staff_id",
];
export function isTemplateOrientation(
  value: unknown
): value is TemplateOrientation {
  return (
    typeof value === "string" &&
    (TEMPLATE_ORIENTATIONS as string[]).includes(value)
  );
}

export interface SchoolRow {
  id: string;
  name: string;
  year: string | null;
  phone: string | null;
  school_code: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  organization_photo_url?: string | null;
  model?: string | null;
  tags?: string | null;
  phone2?: string | null;
  template_id: string | null;
  created_at: Date | null;
  is_active?: boolean | null;
  owner_username?: string | null;
  owner_user_id?: string | null;
}

export interface InstituteRow {
  id: string;
  name: string;
  year: string | null;
  phone: string | null;
  institute_code: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  model?: string | null;
  tags?: string | null;
  template_id?: string | null;
  created_at: Date | null;
  is_active?: boolean | null;
  owner_username?: string | null;
  owner_user_id?: string | null;
}

export interface TemplateRow {
  id: string;
  school_id: string | null;
  name: string;
  orientation: string | null;
  config_json: unknown;
  image_url: string | null;
  created_at: Date | null;
}

export interface NotificationRow {
  id: string;
  school_id: string | null;
  institute_id?: string | null;
  title: string;
  message: string;
  created_by: string | null;
  created_at: Date | null;
}
