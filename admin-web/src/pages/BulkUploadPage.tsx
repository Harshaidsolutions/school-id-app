import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import type {
  ApiErrorBody,
  BulkUploadErrorItem,
  BulkUploadResponse,
  School,
} from "../types";

export function BulkUploadPage() {
  const [searchParams] = useSearchParams();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(searchParams.get("schoolId") ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<BulkUploadErrorItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lockedSchoolId = searchParams.get("schoolId");
  const lockedSchoolName = searchParams.get("schoolName");
  const effectiveSchoolId = lockedSchoolId || schoolId;

  useEffect(() => {
    if (lockedSchoolId) setSchoolId(lockedSchoolId);
  }, [lockedSchoolId]);

  useEffect(() => {
    void api.get<{ schools: School[] }>("/admin/schools").then((res) => {
      setSchools(res.data.schools);
      setSchoolId((current) => {
        if (current) return current;
        if (lockedSchoolId) return lockedSchoolId;
        return res.data.schools[0]?.id ?? "";
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setSuccessMessage(null);
    setErrors(null);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrors(null);
    setErrorMessage(null);

    if (!file) {
      setErrorMessage("Please choose an .xlsx file to upload.");
      return;
    }
    if (!effectiveSchoolId) {
      setErrorMessage("Please select a school.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("schoolId", effectiveSchoolId);

    setLoading(true);
    try {
      const { data } = await api.post<BulkUploadResponse>(
        "/admin/students/bulk-upload",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      if (data.success) {
        const inserted = data.inserted ?? data.imported;
        const updated = data.updated ?? 0;
        setSuccessMessage(
          `Processed ${data.imported} student(s) — ${inserted} new, ${updated} updated. Batch ID: ${data.importBatchId}`
        );
        setFile(null);
      } else {
        setErrors(data.errors);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as
          | BulkUploadResponse
          | ApiErrorBody
          | undefined;
        if (
          body &&
          typeof body === "object" &&
          "success" in body &&
          body.success === false
        ) {
          setErrors(body.errors);
        } else {
          const message =
            body && "message" in body
              ? body.message
              : "Upload failed. Please check the file and try again.";
          setErrorMessage(message ?? "Upload failed.");
        }
      } else {
        setErrorMessage("Upload failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Link
        to={
          lockedSchoolId
            ? `/students?schoolId=${encodeURIComponent(lockedSchoolId)}${lockedSchoolName ? `&schoolName=${encodeURIComponent(lockedSchoolName)}` : ""}`
            : schoolId
              ? `/students?schoolId=${encodeURIComponent(schoolId)}`
              : "/students"
        }
        className="mb-4 inline-block text-sm font-medium text-button-blue hover:underline"
      >
        ← Back to Students
      </Link>

      <form
        onSubmit={handleSubmit}
        className="mb-6 max-w-xl rounded-xl border border-border bg-white p-6 shadow-sm"
      >
        {lockedSchoolId ? (
          <div className="mb-4 rounded-lg bg-content-bg px-3 py-2 text-sm">
            <span className="text-text-muted">School: </span>
            <span className="font-medium text-text-navy">
              {lockedSchoolName ?? schools.find((s) => s.id === lockedSchoolId)?.name ?? "Selected school"}
            </span>
          </div>
        ) : (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-text">School</span>
            <select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            >
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-text">
            Excel file (.xlsx)
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
            className="block w-full text-sm text-text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-green-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-royal-green"
          />
        </label>

        {file && (
          <div className="mt-2 text-sm text-text-muted">Selected: {file.name}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 btn-primary"
        >
          {loading ? "Uploading…" : "Upload students"}
        </button>
      </form>

      {successMessage && (
        <div className="mb-4 alert-success">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 alert-error">
          {errorMessage}
        </div>
      )}
      {errors && errors.length > 0 && (
        <div className="card overflow-hidden border-danger-border">
          <div className="border-b border-danger-border bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            Validation failed — fix these rows and re-upload
          </div>
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-[#EFF6FF] text-left text-xs font-semibold uppercase tracking-wide text-text">
              <tr>
                <th className="px-4 py-3">Row</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {errors.map((item, index) => (
                <tr key={`${item.row}-${index}`}>
                  <td className="px-4 py-3 font-medium">{item.row}</td>
                  <td className="px-4 py-3">{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
