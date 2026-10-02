import { useState } from "react";
import { allValuesLabel, wiseActionLabel } from "../utils/formFieldHelpers";

export type CountOption = { name: string; count: number; key?: string };
export type CategoryField = { label: string; key: string; options: CountOption[] };

type Step = "menu" | "all-type" | "dates" | "date-type" | "value" | "asset";
type Asset = "photo" | "signature";

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function DownloadPhotosModal({
  downloading,
  photoCounts,
  categoryFields,
  showSignature = false,
  onClose,
  onDownload,
}: {
  downloading: boolean;
  photoCounts: Record<string, number>;
  signatureCounts: Record<string, number>;
  showSignature?: boolean;
  categoryFields: CategoryField[];
  onClose: () => void;
  onDownload: (job: {
    asset: Asset;
    date?: string;
    classSection?: string;
    fieldKey?: string;
  }) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [asset, setAsset] = useState<Asset>("photo");

  const activeField = categoryFields[fieldIndex] ?? categoryFields[0];
  const options = activeField?.options ?? [];
  const selectedOption = options.find((item) => item.name === selected);
  const photoDates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));

  function backToMenu() {
    setStep("menu");
    setSelected("");
    setDate("");
    setAsset("photo");
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
            <MenuButton label="All Photos" onClick={() => setStep("all-type")} disabled={downloading} />
            <MenuButton label="Date-wise Photos" onClick={() => setStep("dates")} disabled={downloading} />
            {categoryFields.map((field, index) => (
              <MenuButton
                key={field.key}
                label={`${wiseActionLabel("DOWNLOAD", field.label)} (${field.options.reduce((sum, option) => sum + option.count, 0)})`}
                onClick={() => {
                  setFieldIndex(index);
                  setSelected("");
                  setAsset("photo");
                  setStep("value");
                }}
                disabled={downloading}
              />
            ))}
            <button type="button" className="btn-secondary mt-2 w-full" onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : null}

        {step === "all-type" ? (
          <AssetStep
            title={`All Photos (${Object.values(photoCounts).reduce((sum, count) => sum + count, 0)})`}
            showSignature={showSignature}
            asset={asset}
            onAsset={setAsset}
            downloading={downloading}
            onBack={backToMenu}
            onDownload={() => onDownload({ asset: showSignature ? asset : "photo" })}
          />
        ) : null}

        {step === "dates" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-navy">Date-wise Photos</p>
            {photoDates.length === 0 ? (
              <p className="text-sm text-text-muted">No dates with files are available.</p>
            ) : (
              <select value={date} onChange={(event) => setDate(event.target.value)} className="input-field">
                <option value="">Choose a date</option>
                {photoDates.map(([value, count]) => (
                  <option key={value} value={value} disabled={count === 0}>
                    {dayLabel(value)} — {count} Photos
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-50"
              disabled={!date}
              onClick={() => setStep("date-type")}
            >
              Next
            </button>
            <button type="button" className="btn-secondary w-full" onClick={backToMenu}>
              Back
            </button>
          </div>
        ) : null}

        {step === "date-type" ? (
          <AssetStep
            title={`Date-wise Photos: ${dayLabel(date)}`}
            showSignature={showSignature}
            asset={asset}
            onAsset={setAsset}
            downloading={downloading}
            onBack={() => setStep("dates")}
            onDownload={() => onDownload({ asset: showSignature ? asset : "photo", date })}
          />
        ) : null}

        {step === "value" ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-navy">
              {wiseActionLabel("DOWNLOAD", activeField?.label ?? "Field")}
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
                    {item.count ? ` — ${item.count} Photos` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-50"
              disabled={!selected}
              onClick={() => setStep("asset")}
            >
              Next
            </button>
            <button type="button" className="btn-secondary w-full" onClick={backToMenu}>
              Back
            </button>
          </div>
        ) : null}

        {step === "asset" ? (
          <AssetStep
            title={wiseActionLabel("DOWNLOAD", activeField?.label ?? "Field")}
            showSignature={showSignature}
            asset={showSignature ? asset : "photo"}
            onAsset={setAsset}
            downloading={downloading}
            onBack={() => setStep("value")}
            onDownload={() =>
              onDownload({
                asset,
                classSection: selected === "__all__" ? undefined : selected,
                fieldKey: selected === "__all__" ? undefined : selectedOption?.key || activeField?.key,
              })
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function AssetStep({
  title,
  asset,
  onAsset,
  downloading,
  onBack,
  onDownload,
  showSignature = false,
}: {
  title: string;
  asset: Asset;
  onAsset: (asset: Asset) => void;
  downloading: boolean;
  onBack: () => void;
  onDownload: () => void;
  showSignature?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-navy">{title}</p>
      <label className="block text-sm font-medium text-text-navy">
        Type
        <select
          value={asset}
          onChange={(event) => onAsset(event.target.value as Asset)}
          className="input-field mt-1 w-full"
        >
          <option value="photo">Photo</option>
          {showSignature ? <option value="signature">Signature</option> : null}
        </select>
      </label>
      <button
        type="button"
        className="btn-primary w-full disabled:opacity-50"
        disabled={downloading}
        onClick={onDownload}
      >
        {downloading ? "Preparing…" : "Download"}
      </button>
      <button type="button" className="btn-secondary w-full" onClick={onBack}>
        Back
      </button>
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
