import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import api from "../api/client";
import { CatalogPreviewThumb, ImagePreviewModal } from "../components/ImagePreviewModal";
import { SearchInput } from "../components/ui/SearchInput";
import { UploadDropzone } from "../components/ui/UploadDropzone";
import type { ApiErrorBody, CatalogItem } from "../types";

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function CatalogGridPage({
  kind,
  title,
  searchPlaceholder,
}: {
  kind: "brochure" | "extra_1" | "extra_2";
  title: string;
  searchPlaceholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ items: CatalogItem[] }>("/admin/catalog", {
        params: { kind },
      });
      setItems(data.items);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to load items.");
      } else setError("Failed to load items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const previewIndex = previewItem
    ? filtered.findIndex((item) => item.id === previewItem.id)
    : -1;

  async function handleUpload(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("kind", kind);
        form.append("name", file.name);
        form.append("file", file);
        await api.post("/admin/catalog", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      await load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Upload failed.");
      } else setError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this item?")) return;
    try {
      await api.delete(`/admin/catalog/${id}`);
      await load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Delete failed.");
      } else setError("Delete failed.");
    }
  }

  return (
    <div className="app-page split-layout">
      <div className="split-layout-main">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={searchPlaceholder}
          className="mb-4"
        />
        {error && <div className="mb-4 alert-error">{error}</div>}
        {loading ? (
          <div className="text-sm text-text-muted">Loading {title.toLowerCase()}…</div>
        ) : (
          <div className="card-grid-responsive">
            {filtered.map((item) => (
              <div key={item.id} className="card overflow-hidden">
                <CatalogPreviewThumb
                  imageUrl={item.image_url}
                  alt={item.name}
                  className="max-h-64 w-full object-contain bg-content-bg p-2"
                  onClick={() => setPreviewItem(item)}
                />
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text-navy">{item.name}</div>
                    <div className="text-xs text-text-muted">{formatFileSize(item.file_size)}</div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-danger"
                    onClick={() => void handleDelete(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="split-layout-side split-layout-side-sticky panel-right">
        <h3 className="mb-3 text-sm font-semibold text-text-navy">Upload Photo</h3>
        <UploadDropzone
          title="Click to upload"
          hint="Select one or more JPG, PNG or PDF files (Max 10MB each)"
          uploading={uploading}
          onClick={() => inputRef.current?.click()}
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void handleUpload(files);
          }}
        />
      </aside>

      <ImagePreviewModal
        open={Boolean(previewItem)}
        title={previewItem?.name ?? title}
        imageUrl={previewItem?.image_url}
        onClose={() => setPreviewItem(null)}
        hasPrevious={previewIndex > 0}
        hasNext={previewIndex >= 0 && previewIndex < filtered.length - 1}
        onPrevious={() => {
          if (previewIndex > 0) setPreviewItem(filtered[previewIndex - 1] ?? null);
        }}
        onNext={() => {
          if (previewIndex >= 0 && previewIndex < filtered.length - 1) {
            setPreviewItem(filtered[previewIndex + 1] ?? null);
          }
        }}
      />
    </div>
  );
}

export function BrochuresPage() {
  return (
    <CatalogGridPage
      kind="brochure"
      title="Brochures"
      searchPlaceholder="Search brochures by name..."
    />
  );
}

export function ExtraSection1Page() {
  return (
    <CatalogGridPage
      kind="extra_1"
      title="Extra Section 1"
      searchPlaceholder="Search by name..."
    />
  );
}

export function ExtraSection2Page() {
  return (
    <CatalogGridPage
      kind="extra_2"
      title="Extra Section 2"
      searchPlaceholder="Search by name..."
    />
  );
}
