export function DeleteStudentChoiceModal({
  studentName,
  onClose,
  onDeleteImage,
  onDeleteData,
}: {
  studentName: string;
  onClose: () => void;
  onDeleteImage: () => void;
  onDeleteData: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-text-navy">Delete student</h2>
        <p className="mt-2 text-sm text-text-muted">
          Choose what to delete for <strong>{studentName}</strong>:
        </p>
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onDeleteImage}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg"
          >
            <div className="font-semibold text-text-navy">Delete Image</div>
            <div className="mt-0.5 text-xs text-text-muted">
              Removes only the photo. Student record stays.
            </div>
          </button>
          <button
            type="button"
            onClick={onDeleteData}
            className="w-full rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-left hover:opacity-90"
          >
            <div className="font-semibold text-danger">Delete Data</div>
            <div className="mt-0.5 text-xs text-danger/80">
              Removes the full student record and photo.
            </div>
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
