import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import api, { getAuthToken } from "../api/client";
import { StudentPhotoModal } from "../components/StudentPhotoModal";
import { EditStudentModal } from "../components/EditStudentModal";
import { DeleteStudentChoiceModal } from "../components/DeleteStudentChoiceModal";
import { AddStudentModal } from "../components/AddStudentModal";
import { DeleteOptionsModal, type DeleteJob } from "../components/DeleteOptionsModal";
import { BulkUploadModal } from "../components/BulkUploadModal";
import { DownloadPhotosModal } from "../components/DownloadPhotosModal";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import type { ApiErrorBody, NamedCount, RecordFacets, School, Student, StudentsResponse } from "../types";
import { ExcelDownloadModal } from "../components/ExcelDownloadModal";
import { configuredCategoryFields } from "../utils/formFieldHelpers";
import {
  isPhotoExcelField,
  sortFormFields,
  studentFieldDisplay,
  type FormFieldConfig,
} from "../constants/formFields";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";

type TabKey = "all" | "pending" | "captured" | "pending-data";

function normalizedFieldLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isIdentityColumn(field: FormFieldConfig): boolean {
  if (field.key === "photo_id" || isPhotoExcelField(field)) return true;
  const n = normalizedFieldLabel(field.label);
  return n === "id" || n === "photoid" || n === "photonumber" || n === "photono";
}

function isNameColumn(field: FormFieldConfig): boolean {
  if (field.key === "student_name") return true;
  const n = normalizedFieldLabel(field.label);
  return n === "name" || n === "studentname" || n === "membername";
}

function formatCreated(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(parsed)
    .replace(/\//g, "-");
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
  return { date, time };
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

function dedupeDisplayFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  let seenIdentity = false;
  let seenName = false;
  const out: FormFieldConfig[] = [];
  for (const field of sortFormFields(fields).filter((item) => item.enabled)) {
    if (isIdentityColumn(field)) {
      if (seenIdentity) continue;
      seenIdentity = true;
    } else if (isNameColumn(field)) {
      if (seenName) continue;
      seenName = true;
    }
    out.push(field);
  }
  return out;
}

function recordFlags(student: Student, isInstitute: boolean) {
  const photo =
    typeof student.pending_photo === "boolean"
      ? !student.pending_photo
      : Boolean(student.photo_url?.trim());
  const dataMissing =
    typeof student.pending_data === "boolean"
      ? student.pending_data
      : !student.student_name?.trim() || (!isInstitute && !student.class_section?.trim());
  return { photo, dataMissing };
}

function StudentThumb({ student }: { student: Student }): ReactNode {
  const holder = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    const node = holder.current;
    setSrc("");
    if (!node || !student.photo_url) return;
    let cancelled = false;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void authenticatedStudentPhotoUrl(student.id, {
          thumb: true,
          signal: controller.signal,
          version: student.updated_at,
        }).then((url) => {
          if (!cancelled && url) setSrc(url);
        });
      },
      { rootMargin: "180px" }
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      controller.abort();
      observer.disconnect();
    };
  }, [student.id, student.photo_url, student.photo_captured_at, student.updated_at]);
  return (
    <div ref={holder} className="h-12 w-12 shrink-0">
      {!student.photo_url ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-content-bg text-xs font-semibold text-text-muted">
          {initials(student.student_name)}
        </div>
      ) : src ? (
        <img
          src={src}
          alt={student.student_name ?? "Student"}
          className="h-12 w-12 rounded-lg object-cover ring-1 ring-border"
        />
      ) : (
        <div className="h-12 w-12 animate-pulse rounded-lg bg-content-bg ring-1 ring-border" />
      )}
    </div>
  );
}

function SignatureThumb({
  student,
  onOpen,
}: {
  student: Student;
  onOpen: () => void;
}): ReactNode {
  const holder = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    const node = holder.current;
    setSrc("");
    if (!node || !student.signature_url) return;
    let cancelled = false;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void authenticatedStudentSignatureUrl(student.id, {
          thumb: true,
          signal: controller.signal,
        }).then((url) => {
          if (!cancelled && url) setSrc(url);
        });
      },
      { rootMargin: "180px" }
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      controller.abort();
      observer.disconnect();
    };
  }, [student.id, student.signature_url]);
  if (!student.signature_url) return null;
  return (
    <button
      ref={holder}
      type="button"
      onClick={onOpen}
      title="View signature"
      className="shrink-0"
    >
      {src ? (
        <img
          src={src}
          alt="Signature"
          className="h-8 w-16 rounded bg-white object-contain ring-1 ring-border"
        />
      ) : (
        <span className="block h-8 w-16 animate-pulse rounded bg-content-bg ring-1 ring-border" />
      )}
    </button>
  );
}

async function downloadErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err instanceof Error && !axios.isAxiosError(err) && err.message) {
    return err.message;
  }
  if (!axios.isAxiosError(err)) return fallback;
  const data = err.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as ApiErrorBody;
      if (parsed.message) return parsed.message;
    } catch {
      return fallback;
    }
  }
  const body = data as ApiErrorBody | undefined;
  return body?.message || fallback;
}

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

  const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
  if (blob.size === 0) {
    throw new Error("The download was empty.");
  }
  const type = blob.type || String(res.headers["content-type"] ?? "");
  if (type.includes("application/json") || type.includes("text/plain")) {
    let message = "Download failed.";
    try {
      const parsed = JSON.parse(await blob.text()) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      message = "Download failed.";
    }
    throw new Error(message);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function StudentsPage({ mode = "school" }: { mode?: "school" | "institute" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isInstitute = mode === "institute";
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(searchParams.get("schoolId") ?? "");
  const [instituteId, setInstituteId] = useState(searchParams.get("instituteId") ?? "");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [photoStudent, setPhotoStudent] = useState<Student | null>(null);
  const [signatureStudent, setSignatureStudent] = useState<Student | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deleteChoiceStudent, setDeleteChoiceStudent] = useState<Student | null>(null);
  const [confirmDeletePhotoStudent, setConfirmDeletePhotoStudent] =
    useState<Student | null>(null);
  const [confirmDeleteDataStudent, setConfirmDeleteDataStudent] =
    useState<Student | null>(null);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [signatureCounts, setSignatureCounts] = useState<Record<string, number>>({});
  const [photoClasses, setPhotoClasses] = useState<NamedCount[]>([]);
  const [photoGroups, setPhotoGroups] = useState<NamedCount[]>([]);
  const [photoDesignations, setPhotoDesignations] = useState<NamedCount[]>([]);
  const [facets, setFacets] = useState<RecordFacets | null>(null);
  const [deleteJob, setDeleteJob] = useState<DeleteJob | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [photoFilter, setPhotoFilter] = useState("");
  const [pendingDataFilter, setPendingDataFilter] = useState("");
  const [capturedOn, setCapturedOn] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const [showDeletePhotosOtp, setShowDeletePhotosOtp] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [showDownloadPhotosModal, setShowDownloadPhotosModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otpOpen, setOtpOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
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
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {};
        if (isInstitute && instituteId) params.instituteId = instituteId;
        else if (schoolId) params.schoolId = schoolId;
        if (classFilter) params.classSection = classFilter;
        if (photoFilter) params.photo = photoFilter === "uncaptured" ? "missing" : photoFilter;
        if (pendingDataFilter) params.pendingData = pendingDataFilter;
        if (capturedOn) params.capturedOn = capturedOn;
        if (groupFilter) params.group = groupFilter;
        if (designationFilter) params.designation = designationFilter;
        const { data } = await api.get<StudentsResponse>("/admin/students", {
          params,
        });
        if (!cancelled) {
          setStudents(data.students);
          if (data.facets) setFacets(data.facets);
        }
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
  }, [schoolId, instituteId, isInstitute, classFilter, photoFilter, pendingDataFilter, capturedOn, groupFilter, designationFilter]);

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
    () => dedupeDisplayFields(formFields).filter((field) => field.key !== "signature_upload"),
    [formFields]
  );

  const tableColSpan = enabledFields.length + 4 + (selecting && isDetailView ? 1 : 0);

  const categoryLabels = useMemo(() => {
    const configured = configuredCategoryFields(formFields);
    const labelFor = (kind: "class" | "group" | "designation") =>
      configured.find((field) => field.kind === kind)?.label.trim() ?? "";
    return {
      class: labelFor("class"),
      group: labelFor("group"),
      designation: labelFor("designation"),
    };
  }, [formFields]);

  const categoryFields = useMemo(() => {
    return configuredCategoryFields(formFields).map((field) => {
      const source =
        field.kind === "group"
          ? photoGroups.length
            ? photoGroups
            : (facets?.groups ?? [])
          : field.kind === "designation"
            ? photoDesignations.length
              ? photoDesignations
              : (facets?.designations ?? [])
            : photoClasses.length
              ? photoClasses
              : (facets?.classes ?? []);
      return {
        label: field.label,
        key: field.key,
        options: source.filter(
          (item) => !item.key || item.key === field.key || (field.kind === "class" && item.key === "class_section")
        ),
      };
    });
  }, [formFields, facets, photoClasses, photoGroups, photoDesignations]);

  const classOptions = useMemo(() => {
    const fromFacets = facets?.classes.map((item) => item.name) ?? [];
    if (fromFacets.length) return fromFacets;
    return [
      ...new Set(students.map((s) => s.class_section).filter((c): c is string => Boolean(c))),
    ].sort();
  }, [facets, students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const { photo, dataMissing } = recordFlags(s, isInstitute);
      if (!photoFilter && tab === "pending" && photo) return false;
      if (tab === "pending-data" && !dataMissing) return false;
      if (!photoFilter && tab === "captured" && !photo) return false;
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
  }, [students, tab, classFilter, photoFilter, search, isInstitute]);

  const counts = useMemo(() => {
    let pending = 0;
    let pendingData = 0;
    let captured = 0;
    for (const s of students) {
      const { photo, dataMissing } = recordFlags(s, isInstitute);
      if (!photo) pending += 1;
      if (dataMissing) pendingData += 1;
      if (photo) captured += 1;
    }
    return {
      all: students.length,
      pending,
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
      setError(await downloadErrorMessage(err, "Failed to download photo."));
    } finally {
      setDownloadingPhotoId(null);
    }
  }

  async function handleDownloadExcel(
    scope:
      | "all"
      | "pending"
      | "captured"
      | "uncaptured"
      | "captured-pending-data"
      | "uncaptured-pending-data"
      | "pending-data" = "all",
    extra?: { date?: string; classSection?: string; fieldKey?: string }
  ) {
    if (!orgId) {
      setError(isInstitute ? "Open an institute to download Excel." : "Select a school before downloading Excel.");
      return;
    }
    setExportingExcel(true);
    setError(null);
    try {
      const query = new URLSearchParams({ scope });
      if (extra?.date) query.set("date", extra.date);
      if (extra?.classSection) query.set("classSection", extra.classSection);
      if (extra?.fieldKey) query.set("fieldKey", extra.fieldKey);
      const path = isInstitute
        ? `/admin/institutes/${instituteId}/export-members?${query.toString()}`
        : `/admin/students/${schoolId}/export?${query.toString()}`;
      const filename = isInstitute ? `members-${scope}.xlsx` : `students-${scope}.xlsx`;
      await downloadAuthenticatedFile(path, filename);
      setExcelModalOpen(false);
    } catch (err) {
      setError(await downloadErrorMessage(err, "Failed to download Excel."));
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleDownloadAssets(job: {
    asset: "photo" | "signature";
    date?: string;
    classSection?: string;
    fieldKey?: string;
    scope?: "all" | "pending" | "captured";
  }) {
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
      const base = isInstitute
        ? `/admin/institutes/${instituteId}/download-photos`
        : `/admin/schools/${schoolId}/download-photos`;
      const query = new URLSearchParams();
      if (job.asset === "signature") query.set("asset", "signature");
      if (job.date) query.set("date", job.date);
      if (job.classSection) query.set("classSection", job.classSection);
      if (job.fieldKey) query.set("fieldKey", job.fieldKey);
      if (job.scope) query.set("scope", job.scope);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const name = job.asset === "signature" ? "signatures" : "photos";
      await downloadAuthenticatedFile(`${base}${suffix}`, `${name}.zip`);
      setShowDownloadPhotosModal(false);
    } catch (err) {
      setError(await downloadErrorMessage(err, "Failed to download files."));
    } finally {
      setExportingPhotos(false);
    }
  }

  async function handleDeletePhotosConfirmed(otp: string) {
    if (!orgId || !deleteJob) return;
    const url = deleteJob.kind === "data"
      ? isInstitute
        ? `/admin/institutes/${instituteId}/students`
        : `/admin/schools/${schoolId}/students`
      : isInstitute
        ? `/admin/institutes/${instituteId}/photos`
        : `/admin/schools/${schoolId}/photos`;
    await api.delete(url, {
      data: {
        otp,
        date: deleteJob.date,
        classSection: deleteJob.classSection,
        fieldKey: deleteJob.fieldKey,
        dataScope:
          deleteJob.kind === "photos"
            ? deleteJob.photoScope === "pending"
              ? "uncaptured"
              : deleteJob.photoScope === "captured"
                ? "captured"
                : undefined
            : deleteJob.dataScope,
        asset: deleteJob.kind === "photos" ? "photos" : undefined,
      },
    });
    const params: Record<string, string> = isInstitute
      ? { instituteId: orgId }
      : { schoolId: orgId };
    const { data } = await api.get<StudentsResponse>("/admin/students", { params });
    setStudents(data.students);
    setDeleteJob(null);
    setShowDeletePhotosOtp(false);
  }

  function loadCaptureCounts() {
    if (!orgId) return;
    const path = isInstitute
      ? `/admin/institutes/${instituteId}/photo-capture-counts`
      : `/admin/schools/${schoolId}/photo-capture-counts`;
    void api
      .get<{
        counts: Record<string, number>;
        classes?: NamedCount[];
        groups?: NamedCount[];
        designations?: NamedCount[];
        categories?: NamedCount[];
        signatureCounts?: Record<string, number>;
      }>(path)
      .then(({ data }) => {
        setPhotoCounts(data.counts ?? {});
        setPhotoClasses(data.classes ?? data.categories ?? []);
        setPhotoGroups(data.groups ?? []);
        setPhotoDesignations(data.designations ?? []);
        setSignatureCounts(data.signatureCounts ?? {});
      })
      .catch(() => {
        setPhotoCounts({});
        setPhotoClasses([]);
        setPhotoGroups([]);
        setPhotoDesignations([]);
        setSignatureCounts({});
      });
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
    if (isIdentityColumn(field)) return "col-photo";
    if (field.key === "class_section") return "col-class";
    if (isNameColumn(field)) return "col-name";
    const n = field.label.trim().toLowerCase();
    if (n === "class" || n.includes("section")) return "col-class";
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
          className="mb-4 inline-flex w-fit max-w-full shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-button-blue hover:underline"
        >
          ← Back to {isInstitute ? "Institutes" : "Schools"}
        </Link>
      )}

      {isDetailView ? (
        <>
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

            <button
              type="button"
              disabled={!orgId || exportingExcel}
              onClick={() => setExcelModalOpen(true)}
              className="detail-toolbar-btn"
            >
              {exportingExcel ? "Exporting…" : "Download Excel"}
            </button>

            <button
              type="button"
              disabled={!orgId}
              onClick={() => {
                setShowDownloadPhotosModal(true);
                loadCaptureCounts();
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
              onClick={() => {
                setShowDeleteOptions(true);
                loadCaptureCounts();
              }}
              className="detail-toolbar-btn"
            >
              Delete Options
            </button>

            <button
              type="button"
              disabled={!orgId}
              onClick={() => {
                if (isInstitute) {
                  navigate(`/crop-tool?instituteId=${encodeURIComponent(instituteId)}&instituteName=${encodeURIComponent(searchParams.get("instituteName") ?? "")}`);
                } else {
                  navigate(`/crop-tool?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(selectedSchoolName ?? "")}`);
                }
              }}
              className="detail-toolbar-btn detail-feature-card detail-feature-card-short detail-toolbar-short-slot"
            >
              <span className="detail-feature-icon bg-white/20 text-white" aria-hidden>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 3H3v3M18 3h3v3M6 21H3v-3M18 21h3v-3" />
                  <rect x="7" y="7" width="10" height="10" rx="1" />
                </svg>
              </span>
              <span className="detail-feature-label">CROPPING TOOL</span>
            </button>
            <div className="detail-toolbar-btn detail-toolbar-btn-placeholder detail-feature-card detail-feature-card-long detail-toolbar-long-slot">
              <span className="detail-feature-icon bg-white/20 text-white" aria-hidden>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="11" r="1.6" />
                  <path d="M7 16.5c.6-1.2 1.5-1.8 2.4-1.8s1.6.5 2.1 1.3" />
                  <path d="M13 15h5" />
                </svg>
              </span>
              <span className="detail-feature-label">ID CARD GENERATOR</span>
            </div>
          </div>

          <div className="detail-toolbar-row2">
            <div className="detail-status-tabs-inline detail-toolbar-row2-tabs">
              {(
                [
                  { key: "all" as const, label: "All", count: counts.all },
                  { key: "pending" as const, label: "Pending", count: counts.pending },
                  { key: "captured" as const, label: "Captured", count: counts.captured },
                  { key: "pending-data" as const, label: "Pending Data", count: counts["pending-data"] },
                ]
              ).map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`detail-toolbar-status-tab ${
                      active ? "detail-toolbar-status-tab-active" : "detail-toolbar-status-tab-idle"
                    }`}
                  >
                    {t.label} ({t.count})
                  </button>
                );
              })}
            </div>

            <div className="detail-toolbar-row2-search">
              <div className="relative min-w-0 flex-1">
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
            </div>
            <button
              ref={filterButtonRef}
              type="button"
              className="btn-secondary detail-toolbar-row2-filter"
              onClick={() => setFilterOpen((open) => !open)}
            >
              Filter
            </button>

            <div className="detail-toolbar-row2-actions">
              {selecting ? (
                <button
                  type="button"
                  className="btn-primary shrink-0 disabled:opacity-50"
                  disabled={filtered.filter((student) => selectedIds.has(student.id)).length === 0 || bulkDeleting}
                  onClick={() => {
                    if (filtered.filter((student) => selectedIds.has(student.id)).length === 0) return;
                    setOtpOpen(true);
                  }}
                >
                  {bulkDeleting ? "Deleting…" : "Bulk Delete"}
                </button>
              ) : (
                <button type="button" className="btn-secondary shrink-0" disabled={!orgId || filtered.length === 0} onClick={() => setSelecting(true)}>
                  Bulk Delete
                </button>
              )}
              {selecting ? (
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  disabled={bulkDeleting}
                  onClick={() => {
                    setSelectedIds(new Set());
                    setSelecting(false);
                    setOtpOpen(false);
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={!orgId}
                onClick={handleAddStudent}
                className="detail-toolbar-btn"
              >
                {isInstitute ? "Add Member" : "Add Student"}
              </button>
            </div>
          </div>
          {filterOpen
            ? createPortal(
                <StudentFilterPanel
                  anchor={filterButtonRef.current}
                  onClose={() => setFilterOpen(false)}
                  capturedOn={capturedOn}
                  setCapturedOn={setCapturedOn}
                  classFilter={classFilter}
                  setClassFilter={setClassFilter}
                  groupFilter={groupFilter}
                  setGroupFilter={setGroupFilter}
                  designationFilter={designationFilter}
                  setDesignationFilter={setDesignationFilter}
                  photoFilter={photoFilter}
                  setPhotoFilter={setPhotoFilter}
                  pendingDataFilter={pendingDataFilter}
                  setPendingDataFilter={setPendingDataFilter}
                  facets={facets}
                  classLabel={categoryLabels.class}
                  groupLabel={categoryLabels.group}
                  designationLabel={categoryLabels.designation}
                  onClear={() => {
                    setCapturedOn("");
                    setClassFilter("");
                    setGroupFilter("");
                    setDesignationFilter("");
                    setPhotoFilter("");
                    setPendingDataFilter("");
                  }}
                />,
                document.body
              )
            : null}
        </div>
        </>
      ) : !isDetailView ? (
        <>
          <div className="mb-3 grid grid-cols-4 border-b border-border">
            {(
              [
                { key: "all", label: "All", count: counts.all },
                { key: "pending", label: "Pending", count: counts.pending },
                { key: "captured", label: "Captured", count: counts.captured },
                { key: "pending-data", label: "Pending Data", count: counts["pending-data"] },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`relative min-w-0 px-1 py-2.5 text-center text-[11px] font-medium transition sm:text-xs ${
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
              {selecting && isDetailView ? (
                <th className="bulk-check-cell">
                  <input
                    type="checkbox"
                    className="bulk-check"
                    aria-label={isInstitute ? "Select all members" : "Select all students"}
                    checked={
                      filtered.length > 0 &&
                      filtered.every((student) => selectedIds.has(student.id))
                    }
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const all = filtered.every((student) => prev.has(student.id));
                        if (all) return new Set();
                        return new Set(filtered.map((student) => student.id));
                      });
                    }}
                  />
                </th>
              ) : null}
              <th className="col-sno">S.NO.</th>
              {enabledFields.map((field) => (
                <th key={field.key} className={fieldColumnClass(field)}>
                  {field.label}
                </th>
              ))}
              <th className="col-captured">Captured</th>
              <th className="col-field">Created</th>
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
                  {selecting && isDetailView ? (
                    <td className="bulk-check-cell">
                      <input
                        type="checkbox"
                        className="bulk-check"
                        aria-label={`Select ${student.student_name ?? student.photo_id ?? "record"}`}
                        checked={selectedIds.has(student.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(student.id)) next.delete(student.id);
                            else next.add(student.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                  ) : null}
                  <td className="col-sno text-text-muted">{serial}</td>
                  {enabledFields.map((field) => (
                    <td key={field.key} className={fieldColumnClass(field)}>
                      {isIdentityColumn(field) ? (
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              student.photo_url ? setPhotoStudent(student) : undefined
                            }
                            className="shrink-0"
                            title={student.photo_url ? "View photo" : "No photo captured"}
                          >
                            <StudentThumb student={student} />
                          </button>
                          <SignatureThumb
                            student={student}
                            onOpen={() => setSignatureStudent(student)}
                          />
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
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-soft text-royal-green"
                        title="Captured"
                      >
                        <CheckIcon />
                      </span>
                    ) : (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warning/10 text-warning"
                        title="Pending"
                      >
                        <ClockIcon />
                      </span>
                    )}
                  </td>
                  <td className="col-field">
                    {(() => {
                      const created = student.photo_url?.trim()
                        ? formatCreated(student.photo_captured_at ?? null)
                        : null;
                      if (!created) return "—";
                      return (
                        <span className="block whitespace-normal text-xs leading-4 text-text">
                          {created.date}
                          <br />
                          {created.time}
                        </span>
                      );
                    })()}
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

      {signatureStudent?.signature_url && (
        <StudentPhotoModal
          mode="signature"
          student={signatureStudent}
          students={filtered}
          onNavigate={setSignatureStudent}
          onClose={() => setSignatureStudent(null)}
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
          photoCounts={photoCounts}
          categoryFields={categoryFields}
          counts={{
            allPhotos: students.filter((student) => Boolean(student.photo_url?.trim())).length,
            allData: students.length,
            capturedData: students.filter((student) => Boolean(student.photo_url?.trim())).length,
            uncapturedData: students.filter((student) => !student.photo_url?.trim()).length,
          }}
          onClose={() => setShowDeleteOptions(false)}
          onChoose={(job) => {
            setDeleteJob(job);
            setShowDeleteOptions(false);
            setShowDeletePhotosOtp(true);
          }}
        />
      )}

      {excelModalOpen && orgId ? (
        <ExcelDownloadModal
          downloading={exportingExcel}
          categoryFields={categoryFields}
          captureDates={facets?.captureDates ?? []}
          counts={{
            all: students.length,
            captured: students.filter((student) => Boolean(student.photo_url?.trim())).length,
            pending: students.filter((student) => !student.photo_url?.trim()).length,
            "captured-pending-data": students.filter((student) => Boolean(student.photo_url?.trim()) && student.pending_data).length,
            "uncaptured-pending-data": students.filter((student) => !student.photo_url?.trim() && student.pending_data).length,
          }}
          onClose={() => setExcelModalOpen(false)}
          onDownload={(job) =>
            void handleDownloadExcel(job.scope, {
              date: job.date,
              classSection: job.classSection,
              fieldKey: job.fieldKey,
            })
          }
        />
      ) : null}

      {showDownloadPhotosModal && orgId && (
        <DownloadPhotosModal
          downloading={exportingPhotos}
          photoCounts={photoCounts}
          signatureCounts={signatureCounts}
          showSignature={
            formFields.some((field) => field.key === "signature_upload" && field.enabled) &&
            Object.values(signatureCounts).some((count) => count > 0)
          }
          categoryFields={categoryFields}
          onClose={() => setShowDownloadPhotosModal(false)}
          onDownload={(job) => void handleDownloadAssets(job)}
        />
      )}

      {otpOpen && orgId && (
        <OtpConfirmModal
          title={isInstitute ? "Delete members" : "Delete students"}
          description={`Remove ${filtered.filter((student) => selectedIds.has(student.id)).length} selected ${isInstitute ? "member" : "student"}(s).`}
          confirmLabel="Delete selected"
          onClose={() => {
            if (!bulkDeleting) setOtpOpen(false);
          }}
          onRequestOtp={async () => {
            const ids = filtered.filter((student) => selectedIds.has(student.id)).map((student) => student.id);
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              "/admin/students/bulk-delete/request-otp",
              isInstitute ? { ids, instituteId: orgId } : { ids, schoolId: orgId }
            );
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            const ids = filtered.filter((student) => selectedIds.has(student.id)).map((student) => student.id);
            setBulkDeleting(true);
            try {
              const { data } = await api.post<{ deleted?: string[] }>(
                "/admin/students/bulk-delete",
                isInstitute
                  ? { ids, otp, instituteId: orgId }
                  : { ids, otp, schoolId: orgId }
              );
              const deleted = new Set(data.deleted ?? ids);
              setStudents((prev) => prev.filter((student) => !deleted.has(student.id)));
              setSelectedIds(new Set());
              setSelecting(false);
              setOtpOpen(false);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to delete selected records.");
              }
              throw new Error("Failed to delete selected records.");
            } finally {
              setBulkDeleting(false);
            }
          }}
        />
      )}

      {showDeletePhotosOtp && orgId && deleteJob && (
        <OtpConfirmModal
          title={deleteJob.label}
          description={`${deleteJob.label} for ${selectedSchoolName ?? (isInstitute ? "this institute" : "this school")}. This cannot be undone.`}
          confirmLabel={deleteJob.label}
          onClose={() => setShowDeletePhotosOtp(false)}
          onRequestOtp={async () => {
            const url = deleteJob.kind === "data"
              ? isInstitute
                ? `/admin/institutes/${instituteId}/request-delete-excel-otp`
                : `/admin/schools/${schoolId}/request-delete-excel-otp`
              : isInstitute
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

function StudentFilterPanel({
  anchor,
  onClose,
  capturedOn,
  setCapturedOn,
  classFilter,
  setClassFilter,
  groupFilter,
  setGroupFilter,
  designationFilter,
  setDesignationFilter,
  photoFilter,
  setPhotoFilter,
  pendingDataFilter,
  setPendingDataFilter,
  facets,
  classLabel,
  groupLabel,
  designationLabel,
  onClear,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  capturedOn: string;
  setCapturedOn: (value: string) => void;
  classFilter: string;
  setClassFilter: (value: string) => void;
  groupFilter: string;
  setGroupFilter: (value: string) => void;
  designationFilter: string;
  setDesignationFilter: (value: string) => void;
  photoFilter: string;
  setPhotoFilter: (value: string) => void;
  pendingDataFilter: string;
  setPendingDataFilter: (value: string) => void;
  facets: RecordFacets | null;
  classLabel: string;
  groupLabel: string;
  designationLabel: string;
  onClear: () => void;
}) {
  const [box, setBox] = useState({ top: 0, left: 0, width: 360 });

  useEffect(() => {
    function place() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(560, Math.max(280, window.innerWidth - 16));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const top = Math.min(rect.bottom + 8, window.innerHeight - 16);
      setBox({ top, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchor?.contains(target)) return;
      if (document.getElementById("student-filter-panel")?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  return (
    <div
      id="student-filter-panel"
      className="rounded-xl border border-border bg-white p-3 shadow-xl"
      style={{ position: "fixed", top: box.top, left: box.left, width: box.width, zIndex: 60, maxHeight: "70vh", overflow: "auto" }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="Capture date" value={capturedOn} onChange={setCapturedOn}>
          {(facets?.captureDates ?? []).map((item) => (
            <option key={item.name} value={item.name}>
              {dayLabel(item.name)} — {item.count} Photos
            </option>
          ))}
        </FilterSelect>
        {classLabel ? (
          <FilterSelect label={classLabel} value={classFilter} onChange={setClassFilter}>
            {(facets?.classes ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </FilterSelect>
        ) : null}
        {groupLabel && facets?.groups.length ? (
          <FilterSelect label={groupLabel} value={groupFilter} onChange={setGroupFilter}>
            {facets.groups.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </FilterSelect>
        ) : null}
        {designationLabel && facets?.designations.length ? (
          <FilterSelect label={designationLabel} value={designationFilter} onChange={setDesignationFilter}>
            {facets.designations.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </FilterSelect>
        ) : null}
        <FilterSelect label="Photo" value={photoFilter} onChange={setPhotoFilter}>
          <option value="captured">Captured</option>
          <option value="uncaptured">Uncaptured</option>
        </FilterSelect>
        <FilterSelect label="Required data" value={pendingDataFilter} onChange={setPendingDataFilter}>
          <option value="yes">Pending</option>
          <option value="no">Complete</option>
        </FilterSelect>
        <button type="button" className="btn-secondary" onClick={onClear}>
          Clear Filters
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-[9.5rem] flex-1 text-xs font-medium text-text-navy">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input-field mt-1">
        <option value="">All</option>
        {children}
      </select>
    </label>
  );
}
