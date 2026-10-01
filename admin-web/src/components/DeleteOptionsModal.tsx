import { useState } from "react";
import type { CountOption } from "./DownloadPhotosModal";

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
  classes,
  groups,
  designations,
  onClose,
  onChoose,
}: {
  photoCounts: Record<string, number>;
  classes: CountOption[];
  groups: CountOption[];
  designations: CountOption[];
  onClose: () => void;
  onChoose: (job: DeleteJob) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [kind, setKind] = useState<"class" | "group" | "designation" | "">("");
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");

  const options = kind === "group" ? groups : kind === "designation" ? designations : classes;
  const dates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));
  const kindLabel = kind === "group" ? "Group" : kind === "designation" ? "Designation" : "Class";

  function back() {
    if (step === "photo-value") {
      setSelected("");
      setStep("photo-kind");
      return;
    }
    if (step === "data-value") {
      setSelected("");
      setStep("data-kind");
      return;
    }
    setStep("menu");
    setKind("");
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
              <Row title="Delete Class-wise Photos" onClick={() => openKind("class", "photo-kind")} />
              <Row title="Delete Group-wise Photos" onClick={() => openKind("group", "photo-kind")} />
              <Row title="Delete Designation-wise Photos" onClick={() => openKind("designation", "photo-kind")} />
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
              <Row title="Delete Class-wise Data" onClick={() => openKind("class", "data-kind")} />
              <Row title="Delete Group-wise Data" onClick={() => openKind("group", "data-kind")} />
              <Row title="Delete Designation-wise Data" onClick={() => openKind("designation", "data-kind")} />
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
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-text-navy">
              {kindLabel}
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
                  fieldKey: option?.key || (kind === "class" ? "class_section" : undefined),
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
        ) : null}
      </div>
    </div>
  );

  function openKind(next: "class" | "group" | "designation", nextStep: "photo-kind" | "data-kind") {
    const available =
      next === "group" ? groups.length : next === "designation" ? designations.length : classes.length;
    if (!available) return;
    setKind(next);
    setSelected("");
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
