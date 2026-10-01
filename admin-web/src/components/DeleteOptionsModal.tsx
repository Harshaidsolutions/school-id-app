import { useState } from "react";
import type { CategoryField } from "./DownloadPhotosModal";

export type DeleteJob = {
  kind: "photos" | "data";
  label: string;
  date?: string;
  classSection?: string;
  fieldKey?: string;
  dataScope?: "captured" | "uncaptured";
};

type Step = "menu" | "photo-dates" | "photo-kind" | "photo-value" | "data-kind" | "data-value";

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

  const activeField = fieldIndex >= 0 ? categoryFields[fieldIndex] : undefined;
  const options = activeField?.options ?? [];
  const dates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));
  const fieldActionLabel =
    categoryFields.length === 1 ? `Delete by ${categoryFields[0].label}` : "Delete by field";

  function back() {
    if ((step === "photo-kind" || step === "data-kind") && categoryFields.length > 1 && fieldIndex >= 0) {
      setSelected("");
      setFieldIndex(-1);
      return;
    }
    setStep("menu");
    setFieldIndex(0);
    setSelected("");
    setDate("");
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
              {categoryFields.length > 0 ? (
                <Row title={fieldActionLabel} onClick={() => openField("photo-kind")} />
              ) : null}
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
              {categoryFields.length > 0 ? (
                <Row title={fieldActionLabel} onClick={() => openField("data-kind")} />
              ) : null}
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

        {step === "photo-kind" || step === "data-kind" ? (
          fieldIndex < 0 ? (
            <div className="mt-4 space-y-2">
              {categoryFields.map((item, index) => (
                <Row
                  key={item.key}
                  title={item.label}
                  onClick={() => {
                    setFieldIndex(index);
                    setSelected("");
                  }}
                />
              ))}
              <button type="button" className="btn-secondary mt-2 w-full" onClick={back}>
                Back
              </button>
            </div>
          ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-text-navy">
              {activeField?.label ?? "Field"}
              <select value={selected} onChange={(event) => setSelected(event.target.value)} className="input-field mt-1">
                <option value="">Choose…</option>
                {options.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                    {step === "photo-kind" ? ` — ${item.count} Photos` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-50"
              disabled={!selected}
              onClick={() => {
                const option = options.find((item) => item.name === selected);
                onChoose({
                  kind: step === "photo-kind" ? "photos" : "data",
                  classSection: selected,
                  fieldKey: option?.key || activeField?.key,
                  label: `Delete ${step === "photo-kind" ? "photos" : "data"} for ${selected}`,
                });
              }}
            >
              Delete
            </button>
            <button type="button" className="btn-secondary w-full" onClick={back}>
              Back
            </button>
          </div>
          )
        ) : null}
      </div>
    </div>
  );

  function openField(nextStep: "photo-kind" | "data-kind") {
    if (categoryFields.length === 0) return;
    setSelected("");
    if (categoryFields.length === 1) {
      setFieldIndex(0);
      setStep(nextStep);
      return;
    }
    setFieldIndex(-1);
    setStep(nextStep);
  }
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
