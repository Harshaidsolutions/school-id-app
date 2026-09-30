export function BulkActionBar({
  selectedCount,
  allSelected,
  deleting,
  onToggleAll,
  onClear,
  onDelete,
}: {
  selectedCount: number;
  allSelected: boolean;
  deleting: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
      <label className="flex items-center gap-2 text-sm text-text-navy">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 rounded border-border"
        />
        Select all
      </label>
      <span className="text-sm text-text-muted">
        {selectedCount} selected
      </span>
      <button
        type="button"
        className="btn-secondary px-3 py-1.5 text-sm"
        onClick={onClear}
        disabled={deleting}
      >
        Cancel
      </button>
      <button
        type="button"
        className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
        onClick={onDelete}
        disabled={selectedCount === 0 || deleting}
      >
        {deleting ? "Deleting…" : `Bulk Delete (${selectedCount})`}
      </button>
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
