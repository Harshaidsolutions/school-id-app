import { useMemo, useState } from "react";

type Step = "choose" | "date-wise";

function eachDay(fromIso: string, to: Date): string[] {
  const start = new Date(fromIso);
  if (Number.isNaN(start.getTime())) return [];
  const days: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.reverse();
}

export function DownloadPhotosModal({
  schoolCreatedAt,
  downloadingAll,
  onClose,
  onDownloadAll,
  onDownloadByDate,
}: {
  schoolCreatedAt: string | null;
  downloadingAll: boolean;
  onClose: () => void;
  onDownloadAll: () => void;
  onDownloadByDate: (date: string) => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedDate, setSelectedDate] = useState("");

  const dateOptions = useMemo(
    () => eachDay(schoolCreatedAt ?? new Date().toISOString(), new Date()),
    [schoolCreatedAt]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-navy">Download Photos</h2>
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
                <div className="font-semibold text-text-navy">Download Date-Wise Photos</div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Pick a date and download photos captured on that day.
                </div>
              </button>
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
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedDate || downloadingAll}
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
