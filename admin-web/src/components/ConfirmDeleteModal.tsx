export function ConfirmDeleteModal({
  onClose,
  onConfirm,
  confirming = false,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-text-navy">Confirm delete</h2>
        <p className="mt-2 text-sm text-text-muted">Are you sure you want to delete?</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={confirming}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2 text-sm font-semibold text-danger hover:opacity-90 disabled:opacity-60"
          >
            {confirming ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
