import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { CropToolModal } from "../components/CropToolModal";
import { sortFormFields, type FormFieldConfig } from "../constants/formFields";
import type { Student, StudentsResponse } from "../types";
import { configuredCategoryFields, type ConfiguredCategoryField } from "../utils/formFieldHelpers";
import { isPhotoNumberLabel, isSignatureLabel, organizationCategoryFields } from "../utils/organizationGroups";

export function CropToolPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const instituteId = params.get("instituteId") ?? "";
  const organizationId = params.get("organizationId") ?? "";
  const queryName = params.get("schoolName") ?? params.get("instituteName") ?? params.get("organizationName") ?? "";
  const [resolvedName,setResolvedName]=useState("");
  const orgName=queryName || resolvedName;
  useEffect(()=>{let cancelled=false;setResolvedName("");if(!queryName && (schoolId||instituteId))void api.get(`/admin/${instituteId?"institutes":"schools"}/${instituteId||schoolId}/organization-info`).then(({data})=>{if(!cancelled)setResolvedName(data.organization?.name || "");}).catch(()=>{});return()=>{cancelled=true;};},[queryName,schoolId,instituteId]);
  const isInstitute = Boolean(instituteId);
  const isOrganization = Boolean(organizationId);
  const [students, setStudents] = useState<Student[]>([]);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [organizationCategories, setOrganizationCategories] = useState<ConfiguredCategoryField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId && !instituteId && !organizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (organizationId) {
      setLoading(true);
      void api.get<{
        submissions: Array<{ id: string; serial: number; photoNumber?: string; photoCropped?: boolean; createdAt?: string; values: Record<string, { text?: string | null; hasPhoto: boolean; capturedAt?: string | null; photoCropped?: boolean }> }>;
        form: { fields: Array<{ id: string; field_name: string; field_type: string; enabled?: boolean }> } | null;
      }>(`/admin/organizations/${organizationId}`).then(({ data }) => {
        if (cancelled) return;
        const formFields = (data.form?.fields ?? []).filter((field) => field.enabled !== false);
        const photoFields = formFields.filter((field) => field.field_type === "photo" && !isSignatureLabel(field.field_name));
        const groupFields = organizationCategoryFields(formFields);
        const classField = groupFields.find((field) => field.kind === "class");
        const nameField = formFields.find((field) => field.field_type === "text" && /^(person|student|member|full|employee)?[ _]*name$/i.test(field.field_name.trim())) ?? formFields.find((field) => field.field_type === "text" && /name/i.test(field.field_name) && !/parent|father|mother|guardian/i.test(field.field_name) && !isPhotoNumberLabel(field.field_name));
        const mapped: Student[] = [];
        for (const row of data.submissions ?? []) {
          const extra: Record<string, string | null> = {};
          for (const groupField of groupFields) {
            extra[groupField.key] = row.values[groupField.key]?.text ?? null;
          }
          for (const field of photoFields) {
            if (!row.values[field.id]?.hasPhoto) continue;
            mapped.push({
              id: `${row.id}:${field.id}`,
              school_id: null,
              class_section: classField ? (row.values[classField.key]?.text ?? null) : null,
              extra_fields: extra,
              roll_no: null,
              student_name: nameField ? (row.values[nameField.id]?.text ?? null) : `S.No ${row.serial}`,
              parent_name: null,
              parent_phone: null,
              address: null,
              photo_id: row.photoNumber || String(row.serial),
              photo_url: `/admin/organizations/${organizationId}/submissions/${row.id}/fields/${field.id}/photo`,
              photo_cropped: row.values[field.id]?.photoCropped === true,
              photo_captured_at: row.values[field.id]?.capturedAt ?? null,
              status: "captured",
              import_batch_id: null,
              printed_at: null,
              created_at: row.createdAt ?? null,
              updated_at: row.createdAt ?? null,
            });
          }
        }
        setStudents(mapped);
        setFields([]);
        setOrganizationCategories(groupFields);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    const query = isInstitute
      ? { instituteId, cropPhotos: "1" }
      : { schoolId, cropPhotos: "1" };
    setLoading(true);
    void Promise.all([
      api.get<StudentsResponse>("/admin/students", { params: query }),
      api.get<{ fields: FormFieldConfig[] }>("/admin/form-config", { params: query }),
    ]).then(([studentsRes, configRes]) => {
      if (cancelled) return;
      setStudents(studentsRes.data.students ?? []);
      setFields(sortFormFields(configRes.data.fields ?? []));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId, instituteId, organizationId, isInstitute]);

  const back = isOrganization ? `/extra-2/${encodeURIComponent(organizationId)}` : isInstitute ? `/institute-members?instituteId=${encodeURIComponent(instituteId)}&instituteName=${encodeURIComponent(orgName)}` : `/students?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(orgName)}`;

  return (
    <div className="app-page flex min-h-0 flex-1 flex-col">
      {loading ? <p className="text-sm text-[#64748B]">Loading photos…</p> : (
        <CropToolModal
          layout="page"
          schoolName={orgName}
          storageKey={organizationId ? `organization:${organizationId}` : instituteId ? `institute:${instituteId}` : `school:${schoolId}`}
          students={students}
          categories={isOrganization ? organizationCategories : configuredCategoryFields(fields)}
          onClose={() => navigate(back)}
          onSaved={(student) => {
            if (!student.photo_cropped) return;
            setStudents((current) => current.map((item) => item.id === student.id ? {
              ...item,
              photo_url: student.photo_url,
              photo_captured_at: item.photo_captured_at,
              photo_id: item.photo_id,
              photo_cropped: true,
              status: student.status,
              updated_at: student.updated_at,
            } : item));
          }}
        />
      )}
    </div>
  );
}
