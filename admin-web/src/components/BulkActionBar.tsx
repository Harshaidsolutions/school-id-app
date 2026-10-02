export function BulkModeButtons({
  selecting,
  selectedCount,
  deleting,
  onStart,
  onCancel,
  onConfirm,
  cancelOnRight = false,
}: {
  selecting: boolean;
  selectedCount: number;
  deleting: boolean;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  cancelOnRight?: boolean;
}) {
  if (!selecting) {
    return (
      <button type="button" className="btn-secondary shrink-0" onClick={onStart}>
        Bulk Delete
      </button>
    );
  }
  const cancel = (
    <button
      type="button"
      className="btn-secondary shrink-0"
      onClick={onCancel}
      disabled={deleting}
    >
      Cancel
    </button>
  );
  const confirm = (
    <button
      type="button"
      className="btn-primary shrink-0 disabled:opacity-50"
      onClick={onConfirm}
      disabled={selectedCount === 0 || deleting}
    >
      {deleting ? "Deleting…" : "Bulk Delete"}
    </button>
  );
  return (
    <>
      {cancelOnRight ? confirm : cancel}
      {cancelOnRight ? cancel : confirm}
    </>
  );
}

export function BulkActionBar({
  selectedCount,
  allSelected,
  onToggleAll,
}: {
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white py-2 pl-4 pr-3">
      <label className="flex items-center gap-2 text-sm text-text-navy">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="bulk-check"
          aria-label="Select all"
        />
        Select all
      </label>
      <span className="text-sm text-text-muted">{selectedCount} selected</span>
    </div>
  );
}

export function bulkDeleteMessage(data: {
  deletedCount?: number;
  failedCount?: number;
}): string | null {
  const failed = data.failedCount ?? 0;
  const deleted = data.deletedCount ?? 0;
  if (failed > 0) {
    return `Deleted ${deleted}. ${failed} could not be deleted.`;
  }
  return null;
}
