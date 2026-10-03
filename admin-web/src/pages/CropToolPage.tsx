import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { CropToolModal } from "../components/CropToolModal";
import { sortFormFields, type FormFieldConfig } from "../constants/formFields";
import type { Student, StudentsResponse } from "../types";
import { configuredCategoryFields } from "../utils/formFieldHelpers";

export function CropToolPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const instituteId = params.get("instituteId") ?? "";
  const organizationId = params.get("organizationId") ?? "";
  const orgName = params.get("schoolName") ?? params.get("instituteName") ?? params.get("organizationName") ?? "";
  const isInstitute = Boolean(instituteId);
  const isOrganization = Boolean(organizationId);
  const [students, setStudents] = useState<Student[]>([]);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
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
        submissions: Array<{ id: string; serial: number; photoCropped?: boolean; createdAt?: string; values: Record<string, { hasPhoto: boolean }> }>;
        form: { fields: Array<{ id: string; field_name: string; field_type: string }> } | null;
      }>(`/admin/organizations/${organizationId}`).then(({ data }) => {
        if (cancelled) return;
        const photoFields = (data.form?.fields ?? []).filter((field) => field.field_type === "photo");
        const mapped: Student[] = [];
        for (const row of data.submissions ?? []) {
          for (const field of photoFields) {
            if (!row.values[field.id]?.hasPhoto) continue;
            mapped.push({
              id: `${row.id}:${field.id}`,
              school_id: null,
              class_section: null,
              roll_no: null,
              student_name: `S.No ${row.serial}`,
              parent_name: null,
              parent_phone: null,
              address: null,
              photo_id: String(row.serial),
              photo_url: `/admin/organizations/${organizationId}/submissions/${row.id}/fields/${field.id}/photo`,
              photo_cropped: row.photoCropped === true,
              status: row.photoCropped ? "captured" : "pending",
              import_batch_id: null,
              printed_at: null,
              created_at: row.createdAt ?? null,
              updated_at: row.createdAt ?? null,
            });
          }
        }
        setStudents(mapped);
        setFields([]);
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

  const back = isOrganization
    ? `/extra-2/${encodeURIComponent(organizationId)}`
    : isInstitute
    ? `/institute-members?instituteId=${encodeURIComponent(instituteId)}&instituteName=${encodeURIComponent(orgName)}`
    : `/students?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(orgName)}`;

  return (
    <div className="app-page flex min-h-0 flex-1 flex-col">
      <Link to={back} className="mb-3 inline-flex w-fit text-sm font-semibold text-button-blue hover:underline">
        ← Back to {isOrganization ? "Organization" : isInstitute ? "Members" : "Students"}
      </Link>
      {loading ? <p className="text-sm text-[#64748B]">Loading photos…</p> : (
        <CropToolModal
          layout="page"
          storageKey={organizationId ? `organization:${organizationId}` : instituteId ? `institute:${instituteId}` : `school:${schoolId}`}
          students={students}
          categories={configuredCategoryFields(fields)}
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
