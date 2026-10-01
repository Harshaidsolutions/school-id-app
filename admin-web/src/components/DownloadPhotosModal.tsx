import { useState } from "react";

export type CountOption = { name: string; count: number; key?: string };

type Step = "menu" | "dates" | "signature-dates" | "kind" | "value";

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function DownloadPhotosModal({
  downloading,
  photoCounts,
  signatureCounts,
  classes,
  groups,
  designations,
  onClose,
  onDownload,
}: {
  downloading: boolean;
  photoCounts: Record<string, number>;
  signatureCounts: Record<string, number>;
  classes: CountOption[];
  groups: CountOption[];
  designations: CountOption[];
  onClose: () => void;
  onDownload: (job: {
    asset: "photo" | "signature";
    date?: string;
    classSection?: string;
    fieldKey?: string;
  }) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [kind, setKind] = useState<"class" | "group" | "designation" | "">("");
  const [selected, setSelected] = useState("");

  const kinds = [
    classes.length ? { id: "class" as const, label: "Class" } : null,
    groups.length ? { id: "group" as const, label: "Group" } : null,
    designations.length ? { id: "designation" as const, label: "Designation" } : null,
  ].filter((item): item is { id: "class" | "group" | "designation"; label: string } => Boolean(item));

  const options =
    kind === "group" ? groups : kind === "designation" ? designations : classes;
  const selectedOption = options.find((item) => item.name === selected);
  const photoDates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));
  const signatureDates = Object.entries(signatureCounts).sort(([a], [b]) => b.localeCompare(a));

  function back() {
    if (step === "value") {
      setSelected("");
      setStep("kind");
      return;
    }
    setStep("menu");
    setKind("");
    setSelected("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-text-navy">Download Photos</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-navy" aria-label="Close">
            ×
          </button>
        </div>

        {step === "menu" ? (
          <div className="space-y-2">
            <MenuButton label="All Photos" onClick={() => onDownload({ asset: "photo" })} disabled={downloading} />
            <MenuButton label="Date-wise Photos" onClick={() => setStep("dates")} disabled={downloading} />
            <MenuButton label="All Signatures" onClick={() => onDownload({ asset: "signature" })} disabled={downloading} />
            <MenuButton label="Date-wise Signatures" onClick={() => setStep("signature-dates")} disabled={downloading} />
            <MenuButton label="Class / Group / Designation" onClick={() => setStep("kind")} disabled={downloading || kinds.length === 0} />
            <button type="button" className="btn-secondary mt-2 w-full" onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : null}

        {step === "dates" || step === "signature-dates" ? (
          <DateList
            title={step === "dates" ? "Date-wise Photos" : "Date-wise Signatures"}
            noun={step === "dates" ? "Photos" : "Signatures"}
            dates={step === "dates" ? photoDates : signatureDates}
            downloading={downloading}
            onBack={back}
            onDownload={(date) =>
              onDownload({
                asset: step === "dates" ? "photo" : "signature",
                date,
              })
            }
          />
        ) : null}

        {step === "kind" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-navy">Choose a type</p>
            {kinds.map((item) => (
              <MenuButton
                key={item.id}
                label={item.label}
                disabled={downloading}
                onClick={() => {
                  setKind(item.id);
                  setSelected("");
                  setStep("value");
                }}
              />
            ))}
            <button type="button" className="btn-secondary mt-2 w-full" onClick={back}>
              Back
            </button>
          </div>
        ) : null}

        {step === "value" ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-navy">
              {kind === "group" ? "Group" : kind === "designation" ? "Designation" : "Class"}
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="input-field mt-1"
              >
                <option value="">Choose…</option>
                {options.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} — {item.count} Photos
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-50"
              disabled={downloading || !selectedOption || selectedOption.count === 0}
              onClick={() =>
                onDownload({
                  asset: "photo",
                  classSection: selected,
                  fieldKey: selectedOption?.key || (kind === "class" ? "class_section" : undefined),
                })
              }
            >
              {downloading ? "Preparing…" : "Download"}
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

function MenuButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-semibold text-text-navy hover:bg-content-bg disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function DateList({
  title,
  noun,
  dates,
  downloading,
  onBack,
  onDownload,
}: {
  title: string;
  noun: string;
  dates: [string, number][];
  downloading: boolean;
  onBack: () => void;
  onDownload: (date: string) => void;
}) {
  const [selected, setSelected] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-navy">{title}</p>
      {dates.length === 0 ? (
        <p className="text-sm text-text-muted">No dates with files are available.</p>
      ) : (
        <select value={selected} onChange={(event) => setSelected(event.target.value)} className="input-field">
          <option value="">Choose a date</option>
          {dates.map(([date, count]) => (
            <option key={date} value={date} disabled={count === 0}>
              {dayLabel(date)} — {count} {noun}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="btn-primary w-full disabled:opacity-50"
        disabled={downloading || !selected}
        onClick={() => onDownload(selected)}
      >
        {downloading ? "Preparing…" : "Download"}
      </button>
      <button type="button" className="btn-secondary w-full" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
