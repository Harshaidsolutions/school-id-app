import { useMemo, useState } from "react";
import { calendarDaysFromCreated } from "../utils/calendarDays";
import { formatCalendarDate } from "../utils/formatCalendarDate";

type Step = "choose" | "date-wise" | "category";

export function DownloadPhotosModal({
  schoolCreatedAt,
  downloadingAll,
  photoCounts,
  categories,
  title = "Download Photos",
  onClose,
  onDownloadAll,
  onDownloadByDate,
  onDownloadByCategory,
}: {
  schoolCreatedAt: string | null;
  downloadingAll: boolean;
  photoCounts?: Record<string, number>;
  categories?: { name: string; count: number }[];
  title?: string;
  onClose: () => void;
  onDownloadAll: () => void;
  onDownloadByDate: (date: string) => void;
  onDownloadByCategory?: (name: string) => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedDate, setSelectedDate] = useState("");

  const dateOptions = useMemo(
    () => calendarDaysFromCreated(schoolCreatedAt),
    [schoolCreatedAt]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-navy">{title}</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-navy" aria-label="Close">
            ×
          </button>
        </div>

        {step === "choose" ? (
          <>
            <p className="text-sm text-text-muted">Choose how you want to download photos.</p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                disabled={downloadingAll}
                onClick={onDownloadAll}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg disabled:opacity-50"
              >
                <div className="font-semibold text-text-navy">
                  {downloadingAll ? "Preparing download…" : "Download All Photos"}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Download every captured photo for this school as a ZIP file.
                </div>
              </button>
              <button
                type="button"
                disabled={downloadingAll}
                onClick={() => setStep("date-wise")}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg disabled:opacity-50"
              >
                <div className="font-semibold text-text-navy">Download Date-Wise</div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Pick a date and download files captured or uploaded on that day.
                </div>
              </button>
              {onDownloadByCategory ? (
                <button
                  type="button"
                  disabled={downloadingAll}
                  onClick={() => setStep("category")}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg disabled:opacity-50"
                >
                  <div className="font-semibold text-text-navy">Class / Group / Designation</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    Download photos for one category. A count of 0 cannot be downloaded.
                  </div>
                </button>
              ) : null}
            </div>
          </>
        ) : step === "category" ? (
          <>
            <button type="button" onClick={() => setStep("choose")} className="mb-3 text-sm text-button-blue hover:underline">
              ← Back
            </button>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(categories ?? []).map((row) => (
                <button
                  key={row.name}
                  type="button"
                  disabled={row.count === 0 || downloadingAll}
                  onClick={() => onDownloadByCategory?.(row.name)}
                  className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left disabled:opacity-50"
                >
                  <span className="font-semibold text-text-navy">{row.name}</span>
                  <span className="text-sm text-text-muted">{row.count}</span>
                </button>
              ))}
              {(categories ?? []).length === 0 ? (
                <p className="text-sm text-text-muted">No categories with photos.</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setStep("choose");
                setSelectedDate("");
              }}
              className="mb-3 text-sm text-button-blue hover:underline"
            >
              ← Back
            </button>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-navy">Select date</span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input-field"
              >
                <option value="">Choose a date…</option>
                {dateOptions.map((d) => (
                  <option key={d} value={d}>
                    {formatCalendarDate(d)} — {photoCounts?.[d] ?? 0} Photos
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedDate || downloadingAll || (photoCounts?.[selectedDate] ?? 0) === 0}
              onClick={() => selectedDate && onDownloadByDate(selectedDate)}
              className="btn-primary mt-4 w-full disabled:opacity-50"
            >
              {downloadingAll ? "Downloading…" : "Download photos for selected date"}
            </button>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
