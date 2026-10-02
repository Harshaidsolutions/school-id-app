import { useState } from "react";
import type { CategoryField } from "./DownloadPhotosModal";
import { allValuesLabel, wiseActionLabel } from "../utils/formFieldHelpers";

export type DeleteJob = {
  kind: "photos" | "data";
  label: string;
  date?: string;
  classSection?: string;
  fieldKey?: string;
  dataScope?: "captured" | "uncaptured" | "pending-data";
  photoScope?: "all" | "pending" | "captured";
};

type Step = "menu" | "photo-dates" | "value" | "scope";
type FieldMode = "photos" | "data";

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function DeleteOptionsModal({
  photoCounts,
  categoryFields,
  counts,
  onClose,
  onChoose,
}: {
  photoCounts: Record<string, number>;
  categoryFields: CategoryField[];
  counts: { allPhotos: number; allData: number; capturedData: number; uncapturedData: number };
  onClose: () => void;
  onChoose: (job: DeleteJob) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [fieldMode, setFieldMode] = useState<FieldMode>("photos");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [photoScope, setPhotoScope] = useState<"all" | "pending" | "captured">("all");
  const [dataScope, setDataScope] = useState<"all" | "pending-data" | "captured">("all");

  const activeField = categoryFields[fieldIndex];
  const options = activeField?.options ?? [];
  const dates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));

  function back() {
    if (step === "scope") {
      setStep("value");
      return;
    }
    setStep("menu");
    setSelected("");
    setDate("");
    setPhotoScope("all");
    setDataScope("all");
  }

  function openField(index: number, mode: FieldMode) {
    setFieldIndex(index);
    setFieldMode(mode);
    setSelected("");
    setPhotoScope("all");
    setDataScope("all");
    setStep("value");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-text-navy">Delete Options</h2>
        {step === "menu" ? (
          <>
            <p className="mt-2 text-sm text-text-muted">
              Choose one set. Only that set is removed after OTP confirmation.
            </p>
            <h3 className="mt-4 text-sm font-semibold text-text-navy">Photos</h3>
            <div className="mt-2 space-y-2">
              <Row title={`Delete All Photos (${counts.allPhotos})`} onClick={() => onChoose({ kind: "photos", label: "Delete all photos" })} />
              <Row title={`Delete Date-wise Photos (${counts.allPhotos})`} onClick={() => setStep("photo-dates")} />
              {categoryFields.map((field, index) => (
                <Row
                  key={`photo-${field.key}`}
                  title={`${wiseActionLabel("DELETE", field.label, "Photos")} (${field.options.reduce((sum, option) => sum + option.count, 0)})`}
                  onClick={() => openField(index, "photos")}
                />
              ))}
            </div>
            <h3 className="mt-5 text-sm font-semibold text-text-navy">Data</h3>
            <div className="mt-2 space-y-2">
              <Row title={`Delete Excel / Full Data (${counts.allData})`} onClick={() => onChoose({ kind: "data", label: "Delete full data" })} />
              <Row
                title={`Delete Captured Data (${counts.capturedData})`}
                onClick={() => onChoose({ kind: "data", dataScope: "captured", label: "Delete captured data" })}
              />
              <Row
                title={`Delete Uncaptured Data (${counts.uncapturedData})`}
                onClick={() => onChoose({ kind: "data", dataScope: "uncaptured", label: "Delete uncaptured data" })}
              />
              {categoryFields.map((field, index) => (
                <Row
                  key={`data-${field.key}`}
                  title={`${wiseActionLabel("DELETE", field.label, "Data")} (${counts.allData})`}
                  onClick={() => openField(index, "data")}
                />
              ))}
            </div>
            <button type="button" className="btn-secondary mt-4 w-full" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : null}

        {step === "photo-dates" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-text-navy">Date-wise Photos</p>
            {dates.length === 0 ? (
              <p className="text-sm text-text-muted">No capture dates are available.</p>
            ) : (
              <select value={date} onChange={(event) => setDate(event.target.value)} className="input-field">
                <option value="">Choose a date</option>
                {dates.map(([value, count]) => (
                  <option key={value} value={value}>
                    {dayLabel(value)} — {count} Photos
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-50"
              disabled={!date}
              onClick={() => onChoose({ kind: "photos", date, label: `Delete photos from ${dayLabel(date)}` })}
            >
              Delete
            </button>
            <button type="button" className="btn-secondary w-full" onClick={back}>
              Back
            </button>
          </div>
        ) : null}

        {step === "value" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-text-navy">
              {wiseActionLabel("DELETE", activeField?.label ?? "Field", fieldMode === "photos" ? "Photos" : "Data")}
            </p>
            <label className="block text-sm font-medium text-text-navy">
              {activeField?.label ?? "Field"}
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="input-field mt-1 w-full"
              >
                <option value="">Choose…</option>
                <option value="__all__">{allValuesLabel(activeField?.label ?? "Field")}</option>
                {options.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-50"
              disabled={!selected}
              onClick={() => setStep("scope")}
            >
              Next
            </button>
            <button type="button" className="btn-secondary w-full" onClick={back}>
              Back
            </button>
          </div>
        ) : null}

        {step === "scope" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-text-navy">
              {fieldMode === "photos" ? "Photos" : "Data"}
              {fieldMode === "photos" ? (
                <select
                  value={photoScope}
                  onChange={(event) => setPhotoScope(event.target.value as "all" | "pending" | "captured")}
                  className="input-field mt-1 w-full"
                >
                  <option value="all">All Photos</option>
                  <option value="pending">Pending Photos</option>
                  <option value="captured">Captured Photos</option>
                </select>
              ) : (
                <select
                  value={dataScope}
                  onChange={(event) =>
                    setDataScope(event.target.value as "all" | "pending-data" | "captured")
                  }
                  className="input-field mt-1 w-full"
                >
                  <option value="all">All Data</option>
                  <option value="pending-data">Pending Data</option>
                  <option value="captured">Captured Data</option>
                </select>
              )}
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                const option = options.find((item) => item.name === selected);
                const valueLabel = selected === "__all__" ? allValuesLabel(activeField?.label ?? "Field") : selected;
                const classSection = selected === "__all__" ? undefined : selected;
                const fieldKey = selected === "__all__" ? undefined : option?.key || activeField?.key;
                if (fieldMode === "photos") {
                  onChoose({
                    kind: "photos",
                    classSection,
                    fieldKey,
                    photoScope,
                    dataScope:
                      photoScope === "pending" ? "uncaptured" : photoScope === "captured" ? "captured" : undefined,
                    label: `Delete ${photoScope} photos for ${valueLabel}`,
                  });
                  return;
                }
                onChoose({
                  kind: "data",
                  classSection,
                  fieldKey,
                  dataScope: dataScope === "all" ? undefined : dataScope,
                  label: `Delete ${dataScope === "pending-data" ? "pending" : dataScope} data for ${valueLabel}`,
                });
              }}
            >
              Delete
            </button>
            <button type="button" className="btn-secondary w-full" onClick={back}>
              Back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border px-4 py-3 text-left text-sm font-semibold text-text-navy hover:bg-content-bg"
    >
      {title}
    </button>
  );
}
