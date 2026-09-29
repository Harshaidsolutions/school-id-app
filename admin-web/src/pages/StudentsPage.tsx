import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import api, { getAuthToken } from "../api/client";
import { StudentPhotoModal } from "../components/StudentPhotoModal";
import { EditStudentModal } from "../components/EditStudentModal";
import { DeleteStudentChoiceModal } from "../components/DeleteStudentChoiceModal";
import { AddStudentModal } from "../components/AddStudentModal";
import { DeleteOptionsModal } from "../components/DeleteOptionsModal";
import { BulkUploadModal } from "../components/BulkUploadModal";
import { DownloadPhotosModal } from "../components/DownloadPhotosModal";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import type { ApiErrorBody, Institute, School, Student, StudentsResponse } from "../types";
import {
  isPhotoExcelField,
  sortFormFields,
  studentFieldDisplay,
  type FormFieldConfig,
} from "../constants/formFields";

type TabKey = "all" | "pending-photos" | "pending-data" | "captured";

async function downloadAuthenticatedFile(
  urlPath: string,
  fallbackName: string
): Promise<void> {
  const token = getAuthToken();
  const res = await api.get(urlPath, {
    responseType: "blob",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const disposition = res.headers["content-disposition"] as string | undefined;
  let filename = fallbackName;
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  if (match?.[1]) filename = match[1];

  const blob = new Blob([res.data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StudentsPage({ mode = "school" }: { mode?: "school" | "institute" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isInstitute = mode === "institute";
  const [schools, setSchools] = useState<School[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [schoolId, setSchoolId] = useState(searchParams.get("schoolId") ?? "");
  const [instituteId, setInstituteId] = useState(searchParams.get("instituteId") ?? "");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [photoStudent, setPhotoStudent] = useState<Student | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deleteChoiceStudent, setDeleteChoiceStudent] = useState<Student | null>(null);
  const [confirmDeletePhotoStudent, setConfirmDeletePhotoStudent] =
    useState<Student | null>(null);
  const [confirmDeleteDataStudent, setConfirmDeleteDataStudent] =
    useState<Student | null>(null);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [showDeletePhotosOtp, setShowDeletePhotosOtp] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [showDownloadPhotosModal, setShowDownloadPhotosModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const [exportingPhotos, setExportingPhotos] = useState(false);
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(
    null
  );
  const [formFields, setFormFields] = useState<FormFieldConfig[]>([]);
  const [importBatchCount, setImportBatchCount] = useState(0);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);

  const selectedSchoolName = useMemo(() => {
    if (isInstitute) return searchParams.get("instituteName");
    const fromUrl = searchParams.get("schoolName");
    if (fromUrl) return fromUrl;
    if (!schoolId) return null;
    return schools.find((s) => s.id === schoolId)?.name ?? null;
  }, [schools, schoolId, searchParams, isInstitute]);

  const schoolCreatedAt = useMemo(() => {
    if (!schoolId) return null;
    return schools.find((s) => s.id === schoolId)?.created_at ?? null;
  }, [schools, schoolId]);

  const instituteCreatedAt = useMemo(() => {
    if (!instituteId) return null;
    return institutes.find((i) => i.id === instituteId)?.created_at ?? null;
  }, [institutes, instituteId]);

  const orgCreatedAt = isInstitute ? instituteCreatedAt : schoolCreatedAt;

  const showSchoolPicker = !isInstitute && !searchParams.get("schoolId");
  const isDetailView = isInstitute
    ? Boolean(searchParams.get("instituteId"))
    : Boolean(searchParams.get("schoolId"));
  const orgId = isInstitute ? instituteId : schoolId;

  useEffect(() => {
    if (isInstitute) {
      const fromUrl = searchParams.get("instituteId") ?? "";
      if (fromUrl) setInstituteId(fromUrl);
      return;
    }
    if (!schoolId || !selectedSchoolName) return;
    const currentName = searchParams.get("schoolName");
    if (currentName === selectedSchoolName) return;
    navigate(
      `/students?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(selectedSchoolName)}`,
      { replace: true }
    );
  }, [schoolId, selectedSchoolName, searchParams, navigate, isInstitute]);

  useEffect(() => {
    if (isInstitute) return;
    const fromUrl = searchParams.get("schoolId") ?? "";
    if (fromUrl) setSchoolId(fromUrl);
  }, [searchParams, isInstitute]);

  useEffect(() => {
    if (isInstitute) return;
    void api.get<{ schools: School[] }>("/admin/schools").then((res) => {
      setSchools(res.data.schools);
      setSchoolId((current) => {
        if (current) return current;
        const fromUrl = searchParams.get("schoolId");
        if (fromUrl) return fromUrl;
        return res.data.schools[0]?.id ?? "";
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstitute]);

  useEffect(() => {
    if (!isInstitute) return;
    void api.get<{ institutes: Institute[] }>("/admin/institutes").then((res) => {
      setInstitutes(res.data.institutes);
    });
  }, [isInstitute]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {};
        if (isInstitute && instituteId) params.instituteId = instituteId;
        else if (schoolId) params.schoolId = schoolId;
        const { data } = await api.get<StudentsResponse>("/admin/students", {
          params,
        });
        if (!cancelled) setStudents(data.students);
      } catch (err) {
        if (!cancelled) {
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Failed to load students.");
          } else setError("Failed to load students.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [schoolId, instituteId, isInstitute]);

  useEffect(() => {
    if (!orgId) {
      setFormFields([]);
      setImportBatchCount(0);
      return;
    }
    let cancelled = false;
    void api
      .get<{ fields: FormFieldConfig[]; importBatchCount?: number; configured?: boolean }>(
        "/admin/form-config",
        {
          params: isInstitute ? { instituteId: orgId } : { schoolId: orgId },
        }
      )
      .then((res) => {
        if (cancelled) return;
        setImportBatchCount(res.data.importBatchCount ?? 0);
        if (Array.isArray(res.data.fields) && res.data.fields.length > 0) {
          setFormFields(sortFormFields(res.data.fields));
        } else {
          setFormFields([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFormFields([]);
          setImportBatchCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, isInstitute, location.key]);

  const hasExcelUploaded = importBatchCount > 0;

  async function reloadStudentsAndConfig() {
    if (!orgId) return;
    const params: Record<string, string> = isInstitute
      ? { instituteId: orgId }
      : { schoolId: orgId };
    const [studentsRes, configRes] = await Promise.all([
      api.get<StudentsResponse>("/admin/students", { params }),
      api.get<{ fields: FormFieldConfig[]; importBatchCount?: number }>(
        "/admin/form-config",
        { params }
      ),
    ]);
    setStudents(studentsRes.data.students);
    setImportBatchCount(configRes.data.importBatchCount ?? 0);
    setFormFields(
      Array.isArray(configRes.data.fields) && configRes.data.fields.length > 0
        ? sortFormFields(configRes.data.fields)
        : []
    );
  }

  const enabledFields = useMemo(
    () => sortFormFields(formFields).filter((f) => f.enabled),
    [formFields]
  );

  const tableColSpan = enabledFields.length + 3;

  const classOptions = useMemo(
    () =>
      [
        ...new Set(
          students
            .map((s) => s.class_section)
            .filter((c): c is string => Boolean(c))
        ),
      ].sort(),
    [students]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const photo = Boolean(s.photo_url?.trim());
      const dataMissing =
        !s.student_name?.trim() || (!isInstitute && !s.class_section?.trim());
      if (tab === "pending-photos" && photo) return false;
      if (tab === "pending-data" && !dataMissing) return false;
      if (tab === "captured" && !(photo && !dataMissing)) return false;
      if (classFilter && s.class_section !== classFilter) return false;
      if (q) {
        const hay = [
          s.student_name,
          s.roll_no ?? "",
          s.parent_name ?? "",
          s.parent_phone ?? "",
          s.class_section,
          s.address ?? "",
          s.photo_id ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [students, tab, classFilter, search, isInstitute]);

  const counts = useMemo(() => {
    let pendingPhotos = 0;
    let pendingData = 0;
    let captured = 0;
    for (const s of students) {
      const photo = Boolean(s.photo_url?.trim());
      const dataMissing =
        !s.student_name?.trim() || (!isInstitute && !s.class_section?.trim());
      if (!photo) pendingPhotos += 1;
      if (dataMissing) pendingData += 1;
      if (photo && !dataMissing) captured += 1;
    }
    return {
      all: students.length,
      "pending-photos": pendingPhotos,
      "pending-data": pendingData,
      captured,
    };
  }, [students, isInstitute]);

  async function handleDeleteImage(student: Student) {
    setConfirmDeletePhotoStudent(null);
    setDeletingId(student.id);
    setError(null);
    try {
      const { data } = await api.delete<{ student: Student }>(
        `/admin/students/${student.id}/photo`
      );
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, ...data.student } : s))
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to delete photo.");
      } else setError("Failed to delete photo.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteDataConfirmed(student: Student) {
    await api.delete(`/admin/students/${student.id}`);
    setStudents((prev) => prev.filter((s) => s.id !== student.id));
    setConfirmDeleteDataStudent(null);
  }

  async function handleDownloadStudentPhoto(student: Student) {
    if (!student.photo_url) return;
    setDownloadingPhotoId(student.id);
    setError(null);
    try {
      await downloadAuthenticatedFile(
        `/admin/students/${student.id}/photo`,
        `${student.photo_id ?? student.student_name ?? "photo"}.jpg`
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to download photo.");
      } else setError("Failed to download photo.");
    } finally {
      setDownloadingPhotoId(null);
    }
  }

  async function handleDownloadExcel(scope: "all" | "pending" | "captured" = "all") {
    if (!orgId) {
      setError(isInstitute ? "Open an institute to download Excel." : "Select a school before downloading Excel.");
      return;
    }
    setExportingExcel(true);
    setError(null);
    try {
      const path = isInstitute
        ? `/admin/institutes/${instituteId}/export-members?scope=${scope}`
        : `/admin/students/${schoolId}/export?scope=${scope}`;
      const filename = isInstitute ? `members-${scope}.xlsx` : `students-${scope}.xlsx`;
      await downloadAuthenticatedFile(path, filename);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to download Excel.");
      } else setError("Failed to download Excel.");
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleDownloadAllPhotos() {
    if (!orgId) {
      setError(
        isInstitute
          ? "Open an institute before downloading photos."
          : "Select a school before downloading photos."
      );
      return;
    }
    setExportingPhotos(true);
    setError(null);
    try {
      const path = isInstitute
        ? `/admin/institutes/${instituteId}/download-photos`
        : `/admin/schools/${schoolId}/download-photos`;
      await downloadAuthenticatedFile(path, "photos.zip");
      setShowDownloadPhotosModal(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        let message = "Failed to download photos.";
        const data = err.response?.data;
        if (data instanceof Blob) {
          try {
            const text = await data.text();
            const parsed = JSON.parse(text) as ApiErrorBody;
            if (parsed.message) message = parsed.message;
          } catch {
            // keep default
          }
        } else {
          const body = data as ApiErrorBody | undefined;
          if (body?.message) message = body.message;
        }
        setError(message);
      } else setError("Failed to download photos.");
    } finally {
      setExportingPhotos(false);
    }
  }

  async function handleDownloadPhotosByDate(date: string) {
    if (!orgId) return;
    setExportingPhotos(true);
    setError(null);
    try {
      const base = isInstitute
        ? `/admin/institutes/${instituteId}/download-photos`
        : `/admin/schools/${schoolId}/download-photos`;
      await downloadAuthenticatedFile(
        `${base}?date=${encodeURIComponent(date)}`,
        `photos_${date}.zip`
      );
      setShowDownloadPhotosModal(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        let message = "Failed to download photos.";
        const data = err.response?.data;
        if (data instanceof Blob) {
          try {
            const text = await data.text();
            const parsed = JSON.parse(text) as ApiErrorBody;
            if (parsed.message) message = parsed.message;
          } catch {
            // keep default
          }
        } else {
          const body = data as ApiErrorBody | undefined;
          if (body?.message) message = body.message;
        }
        setError(message);
      } else setError("Failed to download photos.");
    } finally {
      setExportingPhotos(false);
    }
  }

  async function handleDeletePhotosConfirmed(otp: string) {
    if (!orgId) return;
    const url = isInstitute
      ? `/admin/institutes/${instituteId}/photos`
      : `/admin/schools/${schoolId}/photos`;
    await api.delete(url, { data: { otp } });
    setStudents((prev) =>
      prev.map((s) => ({ ...s, photo_url: null, status: "pending" }))
    );
    setShowDeletePhotosOtp(false);
  }

  function isCaptured(student: Student) {
    return Boolean(student.photo_url?.trim());
  }

  function handleAddStudent() {
    if (!orgId) {
      setError(isInstitute ? "Open an institute first." : "Select a school first.");
      return;
    }
    setShowAddStudentModal(true);
  }

  function fieldColumnClass(field: FormFieldConfig): string {
    if (isPhotoExcelField(field)) return "col-photo";
    if (field.key === "class_section") return "col-class";
    if (field.key === "student_name") return "col-name";
    const n = field.label.trim().toLowerCase();
    if (n === "class" || n.includes("section")) return "col-class";
    if (n === "name" || n.includes("student")) return "col-name";
    return "col-field";
  }

  return (
    <div
      className={
        isDetailView
          ? "detail-page-shell admin-scroll-root"
          : "detail-page-content min-w-0 max-w-full"
      }
    >
      {isDetailView && (
        <Link
          to={isInstitute ? "/institutes" : "/schools"}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-button-blue hover:underline"
        >
          ← Back to {isInstitute ? "Institutes" : "Schools"}
        </Link>
      )}

      {isDetailView ? (
        <div className="detail-toolbar-shell">
          <div className="detail-toolbar-row1">
            <button
              type="button"
              disabled={!orgId || !hasExcelUploaded}
              onClick={() => {
                if (isInstitute) {
                  navigate(
                    `/form-setup?instituteId=${encodeURIComponent(instituteId)}&instituteName=${encodeURIComponent(searchParams.get("instituteName") ?? "")}`
                  );
                } else {
                  navigate(
                    `/form-setup?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(selectedSchoolName ?? "")}`
                  );
                }
              }}
              className="detail-toolbar-btn"
            >
              Form Setup
            </button>

            <button
              type="button"
              disabled={!orgId}
              onClick={() => setShowBulkUploadModal(true)}
              className="detail-toolbar-btn"
            >
              Upload Excel
            </button>

            <div className="relative">
              <button
                type="button"
                disabled={!orgId || exportingExcel}
                onClick={() => setExcelMenuOpen((open) => !open)}
                className="detail-toolbar-btn"
              >
                {exportingExcel ? "Exporting…" : "Download Excel"}
              </button>
              {excelMenuOpen ? (
                <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[9.5rem] rounded-lg border border-border bg-white p-1.5 shadow-lg">
                  {(
                    [
                      ["all", "All Excel"],
                      ["pending", "Pending Excel"],
                      ["captured", "Captured Excel"],
                    ] as const
                  ).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      className="block w-full rounded-md px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-navy hover:bg-content-bg"
                      onClick={() => {
                        setExcelMenuOpen(false);
                        void handleDownloadExcel(scope);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={!orgId}
              onClick={() => {
                setShowDownloadPhotosModal(true);
                const path = isInstitute
                  ? `/admin/institutes/${instituteId}/photo-capture-counts`
                  : `/admin/schools/${schoolId}/photo-capture-counts`;
                void api
                  .get<{ counts: Record<string, number> }>(path)
                  .then(({ data }) => setPhotoCounts(data.counts ?? {}))
                  .catch(() => setPhotoCounts({}));
              }}
              className="detail-toolbar-btn"
            >
              Download Photos
            </button>

            <button
              type="button"
              disabled={!orgId}
              onClick={() => {
                if (isInstitute) {
                  navigate(
                    `/institute-info?instituteId=${encodeURIComponent(instituteId)}&instituteName=${encodeURIComponent(searchParams.get("instituteName") ?? "")}`
                  );
                } else {
                  navigate(
                    `/school-info?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(selectedSchoolName ?? "")}`
                  );
                }
              }}
              className="detail-toolbar-btn"
            >
              {isInstitute ? "Institution Info" : "School Info"}
            </button>

            <button
              type="button"
              disabled={!orgId}
              onClick={() => setShowDeleteOptions(true)}
              className="detail-toolbar-btn"
            >
              Delete Options
            </button>

            <div className="detail-toolbar-btn detail-toolbar-btn-placeholder">Empty</div>
            <div className="detail-toolbar-btn detail-toolbar-btn-placeholder">Empty</div>
          </div>

          <div className="detail-toolbar-row2">
            <div className="detail-status-tabs-inline detail-toolbar-row2-tabs">
              {(
                [
                  { key: "all", label: isInstitute ? "All" : "All Classes", count: counts.all },
                  { key: "pending-photos", label: "Pending Photos", count: counts["pending-photos"] },
                  { key: "pending-data", label: "Pending Data", count: counts["pending-data"] },
                  { key: "captured", label: "Captured", count: counts.captured },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`detail-toolbar-status-tab ${
                    tab === t.key ? "detail-toolbar-status-tab-active" : "detail-toolbar-status-tab-idle"
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            <div className="detail-toolbar-row2-search relative min-w-0">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
                <SearchIcon />
              </span>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search"
                className="input-field w-full pl-10 text-sm"
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="detail-toolbar-row2-filter input-field text-sm"
            >
              <option value="">{isInstitute ? "All" : "All Classes"}</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!orgId}
              onClick={handleAddStudent}
              className="detail-toolbar-row2-add detail-toolbar-btn"
            >
              {isInstitute ? "Add Member" : "Add Student"}
            </button>
          </div>
        </div>
      ) : !isDetailView ? (
        <>
          <div className="mb-3 flex gap-1 border-b border-border">
            {(
              [
                { key: "all", label: "All", count: counts.all },
                { key: "pending-photos", label: "Pending Photos", count: counts["pending-photos"] },
                { key: "pending-data", label: "Pending Data", count: counts["pending-data"] },
                { key: "captured", label: "Captured", count: counts.captured },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`relative px-4 py-2.5 text-sm font-medium transition ${
                  tab === t.key ? "text-button-blue" : "text-text-muted hover:text-text-navy"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-text-subtle">({t.count})</span>
                {tab === t.key && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-button-blue" />
                )}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {showSchoolPicker && (
              <select
                value={schoolId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSchoolId(nextId);
                  setClassFilter("");
                  const nextName = schools.find((s) => s.id === nextId)?.name;
                  if (nextId && nextName) {
                    navigate(
                      `/students?schoolId=${encodeURIComponent(nextId)}&schoolName=${encodeURIComponent(nextName)}`
                    );
                  } else {
                    navigate("/students");
                  }
                }}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="">All schools</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <div className="relative min-w-[180px] flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
                <SearchIcon />
              </span>
              <input
                type="search"
                placeholder="Search students…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field w-full pl-10"
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm sm:min-w-[9rem]"
            >
              <option value="">{isInstitute ? "All" : "All Classes"}</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {error && <div className="mb-4 alert-error">{error}</div>}

      {isDetailView && !hasExcelUploaded && !loading ? (
        <div className="card px-6 py-16 text-center text-sm text-text-muted">
          Upload an Excel file to import {isInstitute ? "members" : "students"} and configure fields.
        </div>
      ) : null}

      {(hasExcelUploaded || !isDetailView) && (
      <div
        className={
          isDetailView
            ? "students-table-scroll admin-scroll-panel"
            : "students-table-scroll"
        }
      >
        <table className="students-data-table">
          <thead>
            <tr>
              <th className="col-sno">S.NO.</th>
              {enabledFields.map((field) => (
                <th key={field.key} className={fieldColumnClass(field)}>
                  {field.label}
                </th>
              ))}
              <th className="col-captured">Captured</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {loading && (
              <tr>
                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-text-muted">
                  {isInstitute
                    ? "No members found."
                    : "No students found. Use Excel Upload above to import a spreadsheet."}
                </td>
              </tr>
            )}
            {filtered.map((student, rowIndex) => {
              const captured = isCaptured(student);
              const serial = rowIndex + 1;
              return (
                <tr key={student.id} className="hover:bg-content-bg/50">
                  <td className="col-sno text-text-muted">{serial}</td>
                  {enabledFields.map((field) => (
                    <td key={field.key} className={fieldColumnClass(field)}>
                      {isPhotoExcelField(field) ? (
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              student.photo_url ? setPhotoStudent(student) : undefined
                            }
                            className="shrink-0"
                            title={student.photo_url ? "View photo" : "No photo captured"}
                          >
                            {student.photo_url ? (
                              <img
                                src={student.photo_url}
                                alt={student.student_name ?? "Student"}
                                className="h-12 w-12 rounded-lg object-cover ring-1 ring-border"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-content-bg text-xs font-semibold text-text-muted">
                                {initials(student.student_name)}
                              </div>
                            )}
                          </button>
                          <span className="max-w-[4.5rem] truncate text-[10px] font-medium text-text-muted">
                            {studentFieldDisplay(student, field.key, field.label)}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={
                            fieldColumnClass(field) === "col-name"
                              ? "block truncate font-medium text-text-navy"
                              : "block truncate text-text"
                          }
                          title={studentFieldDisplay(student, field.key, field.label)}
                        >
                          {studentFieldDisplay(student, field.key, field.label)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="col-captured">
                    {captured ? (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-soft text-parrot-green"
                        title="Captured"
                      >
                        <CheckIcon />
                      </span>
                    ) : (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-soft text-primary-orange"
                        title="Pending"
                      >
                        <ClockIcon />
                      </span>
                    )}
                  </td>
                  <td className="col-actions">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        title="Download photo"
                        disabled={
                          !student.photo_url ||
                          downloadingPhotoId === student.id
                        }
                        onClick={() => void handleDownloadStudentPhoto(student)}
                        className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-parrot-green disabled:opacity-30"
                      >
                        <DownloadIcon />
                      </button>
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => setEditStudent(student)}
                        className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-button-blue"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        disabled={deletingId === student.id}
                        onClick={() => setDeleteChoiceStudent(student)}
                        className="rounded p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-60"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {showBulkUploadModal && orgId && (
        <BulkUploadModal
          open={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          schoolId={!isInstitute ? schoolId : undefined}
          instituteId={isInstitute ? instituteId : undefined}
          orgName={selectedSchoolName ?? undefined}
          onSuccess={() => void reloadStudentsAndConfig()}
        />
      )}

      {photoStudent?.photo_url && (
        <StudentPhotoModal
          student={photoStudent}
          students={filtered}
          onNavigate={setPhotoStudent}
          onClose={() => setPhotoStudent(null)}
        />
      )}

      {deleteChoiceStudent && (
        <DeleteStudentChoiceModal
          studentName={deleteChoiceStudent.student_name ?? "Student"}
          onClose={() => setDeleteChoiceStudent(null)}
          onDeleteImage={() => {
            setConfirmDeletePhotoStudent(deleteChoiceStudent);
            setDeleteChoiceStudent(null);
          }}
          onDeleteData={() => {
            setConfirmDeleteDataStudent(deleteChoiceStudent);
            setDeleteChoiceStudent(null);
          }}
        />
      )}

      {confirmDeletePhotoStudent && (
        <ConfirmDeleteModal
          confirming={deletingId === confirmDeletePhotoStudent.id}
          onClose={() => setConfirmDeletePhotoStudent(null)}
          onConfirm={() => void handleDeleteImage(confirmDeletePhotoStudent)}
        />
      )}

      {confirmDeleteDataStudent && (
        <ConfirmDeleteModal
          confirming={deletingId === confirmDeleteDataStudent.id}
          onClose={() => setConfirmDeleteDataStudent(null)}
          onConfirm={async () => {
            setDeletingId(confirmDeleteDataStudent.id);
            setError(null);
            try {
              await handleDeleteDataConfirmed(confirmDeleteDataStudent);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                setError(body?.message ?? "Failed to delete student.");
              } else setError("Failed to delete student.");
            } finally {
              setDeletingId(null);
            }
          }}
        />
      )}

      {showDeleteOptions && orgId && (
        <DeleteOptionsModal
          onClose={() => setShowDeleteOptions(false)}
          onDeletePhotos={() => {
            setShowDeleteOptions(false);
            setShowDeletePhotosOtp(true);
          }}
        />
      )}

      {showDownloadPhotosModal && orgId && (
        <DownloadPhotosModal
          schoolCreatedAt={orgCreatedAt}
          downloadingAll={exportingPhotos}
          photoCounts={photoCounts}
          onClose={() => setShowDownloadPhotosModal(false)}
          onDownloadAll={() => void handleDownloadAllPhotos()}
          onDownloadByDate={(date) => void handleDownloadPhotosByDate(date)}
        />
      )}

      {showDeletePhotosOtp && orgId && (
        <OtpConfirmModal
          title="Delete all photos"
          description={`Remove all captured photos for ${selectedSchoolName ?? (isInstitute ? "this institute" : "this school")}. Student records will remain.`}
          confirmLabel="Delete All Photos"
          onClose={() => setShowDeletePhotosOtp(false)}
          onRequestOtp={async () => {
            const url = isInstitute
              ? `/admin/institutes/${instituteId}/request-delete-photos-otp`
              : `/admin/schools/${schoolId}/request-delete-photos-otp`;
            const { data } = await api.post<{ message?: string; devOtp?: string }>(url);
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            await handleDeletePhotosConfirmed(otp);
          }}
        />
      )}

      <AddStudentModal
        open={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        schoolId={isInstitute ? undefined : schoolId}
        instituteId={isInstitute ? instituteId : undefined}
        formFields={formFields}
        classOptions={classOptions}
        onCreated={(student) => {
          setStudents((prev) => [...prev, student].sort((a, b) =>
            (a.class_section ?? "").localeCompare(b.class_section ?? "") ||
            (a.student_name ?? "").localeCompare(b.student_name ?? "")
          ));
        }}
      />

      {/* Screen 10 — Edit Student Modal */}
      {editStudent && (
        <EditStudentModal
          student={editStudent}
          formFields={formFields}
          classOptions={classOptions}
          onClose={() => setEditStudent(null)}
          onSaved={(updated) => {
            setStudents((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          }}
        />
      )}
    </div>
  );
}

function initials(name: string | null | undefined) {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}
