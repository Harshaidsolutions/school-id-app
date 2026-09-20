export function UploadDropzone({
  title,
  hint,
  uploading,
  onClick,
}: {
  title: string;
  hint: string;
  uploading?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <div className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-border bg-white px-4 py-10 text-center transition-colors group-hover:border-button-blue/40 group-hover:bg-blue-soft/30">
        <svg
          className="mb-2 h-9 w-9 text-text-muted transition-colors group-hover:text-button-blue"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 16V4M8 8l4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <div className="text-sm font-medium text-text-navy">{title}</div>
        <div className="mt-1 text-xs text-text-muted">{hint}</div>
      </div>
      <button
        type="button"
        disabled={uploading}
        onClick={onClick}
        className="absolute inset-0 flex items-center justify-center rounded-xl bg-button-blue/90 text-sm font-semibold text-white opacity-0 transition-opacity hover:bg-button-blue group-hover:opacity-100 disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "Choose File"}
      </button>
    </div>
  );
}
