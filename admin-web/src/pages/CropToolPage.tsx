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
  const orgName = params.get("schoolName") ?? params.get("instituteName") ?? "";
  const isInstitute = Boolean(instituteId);
  const [students, setStudents] = useState<Student[]>([]);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId && !instituteId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
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
  }, [schoolId, instituteId, isInstitute]);

  const back = isInstitute
    ? `/institute-members?instituteId=${encodeURIComponent(instituteId)}&instituteName=${encodeURIComponent(orgName)}`
    : `/students?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(orgName)}`;

  return (
    <div className="app-page flex min-h-0 flex-col">
      <Link to={back} className="mb-3 inline-flex w-fit text-sm font-semibold text-button-blue hover:underline">
        ← Back to {isInstitute ? "Members" : "Students"}
      </Link>
      {loading ? <p className="text-sm text-[#64748B]">Loading photos…</p> : (
        <CropToolModal
          layout="page"
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
