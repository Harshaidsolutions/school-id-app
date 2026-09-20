import { useEffect, useRef, useState, type DragEvent } from "react";

/**
 * Styled image picker — drag/drop or click, filename + preview.
 * Matches the Templates upload zone pattern.
 */
export function ImageUploadField({
  label,
  file,
  existingUrl,
  onChange,
  hint = "PNG or JPEG",
}: {
  label: string;
  file: File | null;
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    existingUrl ?? null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(existingUrl ?? null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, existingUrl]);

  function setFile(next: File | null) {
    if (!next) {
      onChange(null);
      setError(null);
      return;
    }
    if (!next.type.startsWith("image/")) {
      setError("Please choose a PNG or JPEG image.");
      return;
    }
    setError(null);
    onChange(next);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    setFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-text-navy">
        {label}
      </span>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver
            ? "border-button-blue bg-content-bg"
            : "border-border bg-content-bg/40 hover:border-accent-blue hover:bg-content-bg"
        }`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="mx-auto mb-3 max-h-24 rounded-lg object-contain"
          />
        ) : (
          <div className="mb-2 flex justify-center text-text-muted">
            <UploadIcon />
          </div>
        )}
        <p className="text-sm font-medium text-text-navy">
          {file?.name ??
            (existingUrl
              ? "Click or drop to replace image"
              : "Drag & drop, or click to browse")}
        </p>
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
        <span className="mt-3 inline-flex rounded-lg bg-button-blue px-3 py-1.5 text-xs font-semibold text-white">
          {file || existingUrl ? "Change file" : "Choose file"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
