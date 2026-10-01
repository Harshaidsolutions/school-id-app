import { useState } from "react";
import { allValuesLabel, wiseActionLabel } from "../utils/formFieldHelpers";
import type { CategoryField } from "./DownloadPhotosModal";

type ExcelScope =
  | "all"
  | "captured"
  | "pending"
  | "captured-pending-data"
  | "uncaptured-pending-data"
  | "pending-data";

type Step = "menu" | "date" | "value" | "status";

const MENU: { scope: ExcelScope; label: string }[] = [
  { scope: "all", label: "All Excel" },
  { scope: "captured", label: "Captured Photos Excel" },
  { scope: "pending", label: "Pending Photos Excel" },
  { scope: "captured-pending-data", label: "Captured Photos - Pending Data" },
  { scope: "uncaptured-pending-data", label: "Uncaptured Photos - Pending Data" },
];

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function ExcelDownloadModal({
  downloading,
  categoryFields,
  captureDates,
  onClose,
  onDownload,
}: {
  downloading: boolean;
  categoryFields: CategoryField[];
  captureDates: { name: string; count: number }[];
  onClose: () => void;
  onDownload: (job: {
    scope: ExcelScope;
    date?: string;
    classSection?: string;
    fieldKey?: string;
  }) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedScope, setSelectedScope] = useState<ExcelScope | null>(null);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [selectedValue, setSelectedValue] = useState("");
  const [date, setDate] = useState("");
  const [dataType, setDataType] = useState<"all" | "pending-data" | "captured">("all");

  const field = categoryFields[fieldIndex];
  const options = field?.options ?? [];
  const selectedOption = options.find((item) => item.name === selectedValue);

  function chooseMenu(scope: ExcelScope, label: string) {
    setSelectedScope(scope);
    setSelectedLabel(label);
    setStep("menu");
  }

  function downloadReady() {
    if (!selectedScope || downloading) return;
    onDownload({ scope: selectedScope });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-text-navy">Download Excel</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-navy" aria-label="Close">
            ×
          </button>
        </div>

        {step === "menu" ? (
          <div className="space-y-2">
            {MENU.map((item) => (
              <button
                key={item.scope}
                type="button"
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                  selectedScope === item.scope
                    ? "border-button-blue bg-blue-soft text-button-blue"
                    : "border-border bg-white text-text-navy hover:bg-content-bg"
                }`}
                onClick={() => chooseMenu(item.scope, item.label)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-semibold text-text-navy hover:bg-content-bg"
              onClick={() => {
                setDate("");
                setStep("date");
              }}
            >
              Date-wise Captured Data
            </button>
            {categoryFields.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-semibold text-text-navy hover:bg-content-bg"
                onClick={() => {
                  setFieldIndex(index);
                  setSelectedValue("");
                  setDataType("all");
                  setSelectedLabel(wiseActionLabel("DOWNLOAD", item.label));
                  setStep("value");
                }}
              >
                {wiseActionLabel("DOWNLOAD", item.label)}
              </button>
            ))}
          </div>
        ) : null}

        {step === "date" ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-navy">
              Date
              <select
                value={date}
                onChange={(event) => {
                  const value = event.target.value;
                  setDate(value);
                  setSelectedLabel(value ? `Date-wise Captured Data: ${dayLabel(value)}` : "");
                }}
                className="input-field mt-1 w-full"
              >
                <option value="">Choose a date</option>
                {captureDates.map((item) => (
                  <option key={item.name} value={item.name}>
                    {dayLabel(item.name)} — {item.count} Photos
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondary w-full" onClick={() => setStep("menu")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "value" ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-navy">
              {wiseActionLabel("DOWNLOAD", field?.label ?? "Field")}
            </p>
            <label className="block text-sm font-medium text-text-navy">
              {field?.label ?? "Field"}
              <select
                value={selectedValue}
                onChange={(event) => setSelectedValue(event.target.value)}
                className="input-field mt-1 w-full"
              >
                <option value="">Choose…</option>
                <option value="__all__">{allValuesLabel(field?.label ?? "Field")}</option>
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
              disabled={!selectedValue}
              onClick={() => {
                const valueLabel =
                  selectedValue === "__all__"
                    ? allValuesLabel(field?.label ?? "Field")
                    : selectedValue;
                setSelectedLabel(
                  `${wiseActionLabel("DOWNLOAD", field?.label ?? "Field")}: ${valueLabel}`
                );
                setStep("status");
              }}
            >
              Next
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => setStep("menu")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "status" ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-navy">
              Download Type
              <select
                value={dataType}
                onChange={(event) =>
                  setDataType(event.target.value as "all" | "pending-data" | "captured")
                }
                className="input-field mt-1 w-full"
              >
                <option value="all">All Data</option>
                <option value="pending-data">Pending Data</option>
                <option value="captured">Captured Data</option>
              </select>
            </label>
            <button type="button" className="btn-secondary w-full" onClick={() => setStep("value")}>
              Back
            </button>
          </div>
        ) : null}

        {selectedLabel ? (
          <p className="mt-4 text-sm text-text-navy">
            <span className="font-semibold">Selected:</span> {selectedLabel}
            {step === "status"
              ? ` — ${dataType === "pending-data" ? "Pending Data" : dataType === "captured" ? "Captured Data" : "All Data"}`
              : ""}
          </p>
        ) : (
          <p className="mt-4 text-sm text-text-muted">Selected: none</p>
        )}

        <button
          type="button"
          className="btn-primary mt-3 w-full disabled:opacity-50"
          disabled={
            downloading ||
            (step === "menu" && !selectedScope) ||
            (step === "date" && !date) ||
            (step === "value") ||
            (step === "status" && !selectedValue)
          }
          onClick={() => {
            if (step === "date" && date) {
              onDownload({ scope: "captured", date });
              return;
            }
            if (step === "status" && selectedValue) {
              onDownload({
                scope: dataType,
                classSection: selectedValue === "__all__" ? undefined : selectedValue,
                fieldKey:
                  selectedValue === "__all__" ? undefined : selectedOption?.key || field?.key,
              });
              return;
            }
            downloadReady();
          }}
        >
          {downloading ? "Preparing…" : "Download"}
        </button>
        <button type="button" className="btn-secondary mt-2 w-full" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
