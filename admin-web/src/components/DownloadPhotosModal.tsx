import { useState } from "react";

export type CountOption = { name: string; count: number; key?: string };
export type CategoryField = { label: string; key: string; options: CountOption[] };

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
  categoryFields,
  onClose,
  onDownload,
}: {
  downloading: boolean;
  photoCounts: Record<string, number>;
  signatureCounts: Record<string, number>;
  categoryFields: CategoryField[];
  onClose: () => void;
  onDownload: (job: {
    asset: "photo" | "signature";
    date?: string;
    classSection?: string;
    fieldKey?: string;
  }) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [selected, setSelected] = useState("");

  const activeField = categoryFields[fieldIndex] ?? categoryFields[0];
  const options = activeField?.options ?? [];
  const selectedOption = options.find((item) => item.name === selected);
  const photoDates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));
  const signatureDates = Object.entries(signatureCounts).sort(([a], [b]) => b.localeCompare(a));

  function back() {
    if (step === "value" && categoryFields.length > 1) {
      setSelected("");
      setStep("kind");
      return;
    }
    setStep("menu");
    setSelected("");
  }

  function openCategory() {
    setSelected("");
    if (categoryFields.length === 1) {
      setFieldIndex(0);
      setStep("value");
      return;
    }
    setStep("kind");
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
            {categoryFields.length > 0 ? (
              <MenuButton
                label={categoryFields.length === 1 ? categoryFields[0].label : "By field"}
                onClick={openCategory}
                disabled={downloading}
              />
            ) : null}
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
            {categoryFields.map((item, index) => (
              <MenuButton
                key={item.key}
                label={item.label}
                disabled={downloading}
                onClick={() => {
                  setFieldIndex(index);
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
              {activeField?.label ?? "Field"}
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
                  fieldKey: selectedOption?.key || activeField?.key,
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
