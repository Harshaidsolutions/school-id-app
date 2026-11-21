import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody, BulkUploadErrorItem, BulkUploadResponse } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId?: string;
  schoolId?: string;
  instituteId?: string;
  orgName?: string;
  onSuccess?: () => void;
};

export function BulkUploadModal({
  open,
  onClose,
  schoolId,
  organizationId,
  instituteId,
  orgName,
  onSuccess,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<BulkUploadErrorItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasExistingExcel, setHasExistingExcel] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [sheets, setSheets] = useState<string[] | null>(null);
  const [chosenSheet, setChosenSheet] = useState<string>("");
  const [groupingFields, setGroupingFields] = useState<string[] | null>(null);

  const orgId = organizationId || schoolId || instituteId;

  useEffect(() => {
    if (!open || !orgId) return;
    setFile(null);
    setSuccessMessage(null);
    setErrors(null);
    setErrorMessage(null);
    setShowReplaceConfirm(false);
    setSheets(null);
    setChosenSheet("");
    setGroupingFields(null);
    if (organizationId) { setHasExistingExcel(false); return; }
    void api
      .get<{ importBatchCount?: number }>("/admin/form-config", {
        params: schoolId ? { schoolId } : { instituteId },
      })
      .then((res) => setHasExistingExcel((res.data.importBatchCount ?? 0) > 0))
      .catch(() => setHasExistingExcel(false));
  }, [open, orgId, schoolId, instituteId, organizationId]);

  if (!open) return null;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setSuccessMessage(null);
    setErrors(null);
    setErrorMessage(null);
    setSheets(null);
    setChosenSheet("");
    setGroupingFields(null);
  }

  async function performUpload(replaceExisting: boolean, sheet?: string) {
    if (!file || !orgId) return;

    const formData = new FormData();
    formData.append("file", file);
    if (schoolId) formData.append("schoolId", schoolId);
    if (instituteId) formData.append("instituteId", instituteId);
    if (replaceExisting) formData.append("replaceExisting", "true");
    if (sheet) formData.append("sheet", sheet);

    setLoading(true);
    setErrorMessage(null);
    setErrors(null);
    setSuccessMessage(null);
    try {
      const { data } = await api.post<
        BulkUploadResponse & {
          needSheet?: boolean;
          sheets?: string[];
          needsGrouping?: boolean;
          fields?: string[];
        }
      >(
        organizationId ? `/admin/organizations/${organizationId}/excel` : "/admin/students/bulk-upload",
        formData
      );

      // Multi-sheet workbook: ask which worksheet to import, then re-upload.
      if (data.needSheet && Array.isArray(data.sheets) && data.sheets.length > 0) {
        setSheets(data.sheets);
        setChosenSheet(data.sheets[0] ?? "");
        setShowReplaceConfirm(false);
        setLoading(false);
        return;
      }

      if (data.success || (organizationId && (data as unknown as {status: string}).status === "ok")) {
        // Headers-only sheet: records couldn't be auto-grouped. Point the admin to
        // Form Setup to choose one grouping field (any field) and its options.
        if (data.needsGrouping) {
          setGroupingFields(Array.isArray(data.fields) ? data.fields : []);
        }
        setSuccessMessage(
          replaceExisting || ("replaced" in data && data.replaced)
            ? "Excel replaced successfully."
            : "Excel uploaded successfully."
        );
        setFile(null);
        setShowReplaceConfirm(false);
        setHasExistingExcel(!organizationId);
        onSuccess?.();
      } else {
        setErrors(data.errors);
        if (replaceExisting) {
          setShowReplaceConfirm(true);
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as BulkUploadResponse | ApiErrorBody | undefined;
        if (body && typeof body === "object" && "success" in body && body.success === false) {
          setErrors(body.errors);
        } else {
          setErrorMessage(
            body && "message" in body && body.message
              ? body.message
              : "Upload failed. Please check the file and try again."
          );
        }
      } else {
        setErrorMessage("Upload failed. Please try again.");
      }
      if (replaceExisting) {
        setShowReplaceConfirm(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setErrorMessage("Please choose an .xlsx file to upload.");
      return;
    }
    if (hasExistingExcel) {
      setShowReplaceConfirm(true);
      return;
    }
    void performUpload(false);
  }

  function errorBlock() {
    if (!errorMessage && (!errors || errors.length === 0)) return null;
    return (
      <>
        {errorMessage && <div className="alert-error">{errorMessage}</div>}
        {errors && errors.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-danger-border bg-danger-soft p-3 text-xs">
            {errors.map((item) => (
              <div key={`${item.row}-${item.reason}`} className="py-0.5 text-danger">
                Row {item.row}: {item.reason}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-xl">
        <div className="mb-4 text-center">
          <h2 className="page-heading text-xl">Upload Excel</h2>
          {orgName ? (
            <p className="mt-1 text-sm font-medium text-text-muted">{orgName}</p>
          ) : null}
        </div>

        {successMessage ? (
          <div className="space-y-4 text-center">
            <div className="alert-success">{successMessage}</div>
            {groupingFields ? (
              <div className="rounded-lg border border-border bg-surface p-3 text-left text-sm text-text-navy">
                <p className="font-semibold">This sheet has only column headings — there are no records to group yet.</p>
                <p className="mt-1 text-text-muted">
                  Open <b>Form Setup</b> and choose <b>one</b> field to group by (any field you need).
                  Set its type to <b>Dropdown</b>, add the options, turn on grouping, and save. You can add
                  more grouping fields later. Fields found in this sheet:
                </p>
                <p className="mt-2 font-medium">{groupingFields.join(", ") || "—"}</p>
              </div>
            ) : null}
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : sheets ? (
          <div className="space-y-4">
            <p className="text-sm text-text-navy">
              This workbook has multiple sheets. Choose the one to import:
            </p>
            <select
              className="input-field"
              value={chosenSheet}
              onChange={(e) => setChosenSheet(e.target.value)}
            >
              {sheets.map((sn) => (
                <option key={sn} value={sn}>
                  {sn}
                </option>
              ))}
            </select>
            {errorBlock()}
            <div className="flex gap-3">
              <button
                type="button"
                className="btn-secondary flex-1"
                disabled={loading}
                onClick={() => setSheets(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={loading || !chosenSheet}
                onClick={() => {
                  if (hasExistingExcel) {
                    setSheets(null);
                    setShowReplaceConfirm(true);
                  } else {
                    void performUpload(false, chosenSheet);
                  }
                }}
              >
                {loading ? "Importing…" : "Import sheet"}
              </button>
            </div>
          </div>
        ) : showReplaceConfirm ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-text-navy">
              Update matching records and keep photos, or replace uncaptured records. Replacement removes existing records and form settings.
            </p>
            {errorBlock()}
            <div className="flex gap-3">
              <button
                type="button"
                className="btn-secondary flex-1"
                disabled={loading}
                onClick={() => {
                  setShowReplaceConfirm(false);
                  setErrors(null);
                  setErrorMessage(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={loading || !file}
                onClick={() => void performUpload(true, chosenSheet || undefined)}
              >
                {loading ? "Uploading…" : "Replace"}
              </button>
              <button type="button" className="btn-primary flex-1" disabled={loading || !file}
                onClick={() => void performUpload(false, chosenSheet || undefined)}>
                Update / Add
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorBlock()}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-navy">Excel file (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="input-field"
              />
            </label>

            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={loading || !file}>
                {loading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
