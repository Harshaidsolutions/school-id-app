import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import type {
  ApiErrorBody,
  Template,
  TemplateOrientation,
} from "../types";
import { TEMPLATE_TABS } from "../types";

function readDescription(config: unknown): string {
  if (config && typeof config === "object" && "description" in config) {
    const d = (config as { description?: unknown }).description;
    return typeof d === "string" ? d : "";
  }
  return "";
}

/**
 * Add / Edit Template Modal — templates are global (all schools).
 */
export function TemplateFormModal({
  template,
  defaultOrientation,
  onClose,
  onSaved,
}: {
  template: Template | null;
  defaultOrientation: TemplateOrientation | "all";
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(template);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(template?.name ?? "");
  const [description, setDescription] = useState(
    readDescription(template?.config_json)
  );
  const [orientation, setOrientation] = useState<TemplateOrientation>(
    (template?.orientation as TemplateOrientation) ||
      (defaultOrientation !== "all" ? defaultOrientation : "vertical_single")
  );
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    template?.image_url ?? null
  );
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function setFile(file: File | null) {
    if (!file) {
      setImage(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG or JPEG).");
      return;
    }
    setError(null);
    setImage(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    setFile(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    try {
      const configJson = JSON.stringify({ description: description.trim() });
      const form = new FormData();
      form.append("name", title.trim());
      form.append("orientation", orientation);
      form.append("config_json", configJson);
      if (image) form.append("image", image);

      if (isEdit && template) {
        await api.put(`/admin/templates/${template.id}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await api.post("/admin/templates", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to save template.");
      } else {
        setError("Failed to save template.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-blue/55 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2
            id="template-modal-title"
            className="text-lg font-bold text-text-navy"
          >
            {isEdit ? "Edit Template" : "Add Template"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-content-bg"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-navy">Title</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-navy">
              Description
            </span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field resize-y"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-navy">
              Orientation
            </span>
            <select
              required
              value={orientation}
              onChange={(e) =>
                setOrientation(e.target.value as TemplateOrientation)
              }
              className="input-field"
            >
              {TEMPLATE_TABS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <p className="rounded-lg bg-content-bg px-3 py-2 text-xs text-text-muted">
            This template will be available to all schools and teachers.
          </p>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-text-navy">
              Template image
            </span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                dragOver
                  ? "border-button-blue bg-content-bg"
                  : "border-border bg-content-bg/40 hover:border-accent-blue hover:bg-content-bg"
              }`}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Template preview"
                  className="mx-auto mb-3 max-h-40 rounded-lg object-contain"
                />
              ) : (
                <div className="mb-2 flex justify-center text-text-muted">
                  <UploadIcon />
                </div>
              )}
              <p className="text-sm font-medium text-text-navy">
                {image
                  ? image.name
                  : "Drag & drop an image here, or click to browse"}
              </p>
              <p className="mt-1 text-xs text-text-muted">PNG or JPEG</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg bg-button-blue px-4 py-3 text-sm font-semibold tracking-wider text-white uppercase shadow-sm hover:bg-button-blue-hover disabled:opacity-60"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-8 w-8"
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
