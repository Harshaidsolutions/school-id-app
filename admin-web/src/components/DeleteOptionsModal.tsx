import { useState } from "react";
import type { CategoryField } from "./DownloadPhotosModal";
import { allValuesLabel, wiseActionLabel } from "../utils/formFieldHelpers";

export type DeleteJob = {
  kind: "photos" | "data";
  label: string;
  date?: string;
  classSection?: string;
  fieldKey?: string;
  dataScope?: "captured" | "uncaptured";
};

type Step = "menu" | "photo-dates" | "value" | "scope";
type DeleteScope = "photos" | "all-data" | "pending" | "captured";

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function DeleteOptionsModal({
  photoCounts,
  categoryFields,
  onClose,
  onChoose,
}: {
  photoCounts: Record<string, number>;
  categoryFields: CategoryField[];
  onClose: () => void;
  onChoose: (job: DeleteJob) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [scope, setScope] = useState<DeleteScope>("photos");

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
    setScope("photos");
  }

  function openField(index: number) {
    setFieldIndex(index);
    setSelected("");
    setScope("photos");
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
              <Row title="Delete All Photos" onClick={() => onChoose({ kind: "photos", label: "Delete all photos" })} />
              <Row title="Delete Date-wise Photos" onClick={() => setStep("photo-dates")} />
            </div>
            <h3 className="mt-5 text-sm font-semibold text-text-navy">Data</h3>
            <div className="mt-2 space-y-2">
              <Row title="Delete Excel / Full Data" onClick={() => onChoose({ kind: "data", label: "Delete full data" })} />
              <Row
                title="Delete Captured Data"
                onClick={() => onChoose({ kind: "data", dataScope: "captured", label: "Delete captured data" })}
              />
              <Row
                title="Delete Uncaptured Data"
                onClick={() => onChoose({ kind: "data", dataScope: "uncaptured", label: "Delete uncaptured data" })}
              />
              {categoryFields.map((field, index) => (
                <Row
                  key={field.key}
                  title={wiseActionLabel("DELETE", field.label)}
                  onClick={() => openField(index)}
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
              Scope
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as DeleteScope)}
                className="input-field mt-1 w-full"
              >
                <option value="photos">Photos</option>
                <option value="all-data">All data</option>
                <option value="pending">Pending</option>
                <option value="captured">Captured</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                const option = options.find((item) => item.name === selected);
                const valueLabel = selected === "__all__" ? allValuesLabel(activeField?.label ?? "Field") : selected;
                const classSection = selected === "__all__" ? undefined : selected;
                const fieldKey = selected === "__all__" ? undefined : option?.key || activeField?.key;
                if (scope === "photos") {
                  onChoose({
                    kind: "photos",
                    classSection,
                    fieldKey,
                    label: `Delete photos for ${valueLabel}`,
                  });
                  return;
                }
                onChoose({
                  kind: "data",
                  classSection,
                  fieldKey,
                  dataScope: scope === "pending" ? "uncaptured" : scope === "captured" ? "captured" : undefined,
                  label: `Delete ${scope === "pending" ? "pending" : scope === "captured" ? "captured" : "all"} data for ${valueLabel}`,
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
