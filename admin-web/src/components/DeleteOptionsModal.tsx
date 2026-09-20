export function DeleteOptionsModal({
  onClose,
  onDeleteExcel,
  onDeletePhotos,
  showDeletePhotos = true,
}: {
  onClose: () => void;
  onDeleteExcel: () => void;
  onDeletePhotos: () => void;
  showDeletePhotos?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-text-navy">Delete Options</h2>
        <p className="mt-2 text-sm text-text-muted">
          Choose what to delete. Both actions require OTP confirmation.
        </p>
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onDeleteExcel}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg"
          >
            <div className="font-semibold text-text-navy">Delete Excel</div>
            <div className="mt-0.5 text-xs text-text-muted">
              Removes all imported student records for this organization.
            </div>
          </button>
          {showDeletePhotos && (
            <button
              type="button"
              onClick={onDeletePhotos}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left hover:bg-content-bg"
            >
              <div className="font-semibold text-text-navy">Delete All Photos</div>
              <div className="mt-0.5 text-xs text-text-muted">
                Removes all captured photos. Student records remain.
              </div>
            </button>
          )}
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
