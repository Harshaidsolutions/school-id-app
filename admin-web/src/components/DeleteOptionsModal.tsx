import { useState } from "react";

export type DeleteJob = {
  kind: "photos" | "data";
  label: string;
  date?: string;
  classSection?: string;
  dataScope?: "captured" | "uncaptured";
};

export function DeleteOptionsModal({
  classOptions,
  onClose,
  onChoose,
}: {
  classOptions: string[];
  onClose: () => void;
  onChoose: (job: DeleteJob) => void;
}) {
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-text-navy">Delete Options</h2>
        <p className="mt-2 text-sm text-text-muted">
          Deletion asks for OTP only after you choose an option. Records outside the selected set stay unchanged.
        </p>

        <h3 className="mt-5 text-sm font-semibold text-text-navy">Photos</h3>
        <div className="mt-2 space-y-2">
          <Option
            title="Delete All Photos"
            detail="Removes every captured photo. Records remain."
            onClick={() => onChoose({ kind: "photos", label: "Delete all photos" })}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-navy">Delete Date-wise Photos</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
            />
          </label>
          <button
            type="button"
            disabled={!date}
            className="btn-secondary w-full disabled:opacity-50"
            onClick={() => onChoose({ kind: "photos", date, label: `Delete photos from ${date}` })}
          >
            Delete photos for selected date
          </button>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-navy">Class / Group / Designation</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              <option value="">Choose…</option>
              {classOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!category}
            className="btn-secondary w-full disabled:opacity-50"
            onClick={() =>
              onChoose({ kind: "photos", classSection: category, label: `Delete photos for ${category}` })
            }
          >
            Delete photos for selected category
          </button>
        </div>

        <h3 className="mt-5 text-sm font-semibold text-text-navy">Excel / Data</h3>
        <div className="mt-2 space-y-2">
          <Option
            title="Delete Excel (Full)"
            detail="Deletes all uploaded student or member records for this organization."
            onClick={() => onChoose({ kind: "data", label: "Delete all Excel data" })}
          />
          <Option
            title="Delete Captured Data"
            detail="Deletes records that already have a captured photo."
            onClick={() => onChoose({ kind: "data", dataScope: "captured", label: "Delete captured data" })}
          />
          <Option
            title="Delete Uncaptured Data"
            detail="Deletes records whose photo has not been captured."
            onClick={() => onChoose({ kind: "data", dataScope: "uncaptured", label: "Delete uncaptured data" })}
          />
          <button
            type="button"
            disabled={!category}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg disabled:opacity-50"
            onClick={() =>
              onChoose({
                kind: "data",
                classSection: category,
                label: `Delete data for ${category}`,
              })
            }
          >
            <div className="font-semibold text-text-navy">Delete Class/Group/Designation Data</div>
            <div className="mt-0.5 text-xs text-text-muted">Uses the category selected above.</div>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Option({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg"
    >
      <div className="font-semibold text-text-navy">{title}</div>
      <div className="mt-0.5 text-xs text-text-muted">{detail}</div>
    </button>
  );
}
