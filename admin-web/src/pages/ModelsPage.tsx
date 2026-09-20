import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import { ImagePreviewModal } from "../components/ImagePreviewModal";
import { SearchInput } from "../components/ui/SearchInput";
import { formatFileSize } from "./CatalogPages";
import type { ApiErrorBody, CatalogItem } from "../types";

const MAX_DESCRIPTION_WORDS = 500;

const MODEL_PAGE_TABS = [
  { key: "model" as const, label: "ID Card Models" },
  { key: "tag" as const, label: "ID Card Tags" },
];

type ModelPageTab = (typeof MODEL_PAGE_TABS)[number]["key"];

function nameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || filename;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function ModelsPage() {
  const [tab, setTab] = useState<ModelPageTab>("model");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameFromFile, setNameFromFile] = useState(false);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);
  const [descriptionPreview, setDescriptionPreview] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const descriptionWordCount = countWords(description);
  const isTagsTab = tab === "tag";
  const itemLabel = isTagsTab ? "Tag" : "Model";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ items: CatalogItem[] }>("/admin/catalog", {
        params: { kind: tab },
      });
      setItems(data.items.filter((item) => item.kind === tab));
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? `Failed to load ${isTagsTab ? "tags" : "models"}.`);
      } else setError(`Failed to load ${isTagsTab ? "tags" : "models"}.`);
    } finally {
      setLoading(false);
    }
  }, [tab, isTagsTab]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true;
      if (isTagsTab) return false;
      return (item.description ?? "").toLowerCase().includes(q);
    });
  }, [items, search, isTagsTab]);

  const tableColSpan = isTagsTab ? 5 : 6;

  const previewIndex = previewItem
    ? filtered.findIndex((item) => item.id === previewItem.id)
    : -1;

  function resetForm() {
    setEditing(null);
    setName("");
    setNameFromFile(false);
    setDescription("");
    setFile(null);
  }

  function handleFileSelect(selected: File | null) {
    if (!selected) {
      setFile(null);
      return;
    }
    setFile(selected);
    if (!editing) {
      setName(nameFromFilename(selected.name));
      setNameFromFile(true);
    }
  }

  function switchTab(next: ModelPageTab) {
    if (next === tab) return;
    setTab(next);
    setSearch("");
    setItems([]);
    resetForm();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isTagsTab && descriptionWordCount > MAX_DESCRIPTION_WORDS) {
      setError(`Description must be ${MAX_DESCRIPTION_WORDS} words or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("kind", tab);
      form.append("name", name.trim());
      form.append("description", isTagsTab ? "" : description.trim());
      if (file) form.append("file", file);
      if (editing) {
        await api.put(`/admin/catalog/${editing.id}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        if (!file) throw new Error("Image is required");
        await api.post(`/admin/catalog?kind=${encodeURIComponent(tab)}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      resetForm();
      await load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Save failed.");
      } else setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete this ${itemLabel.toLowerCase()}?`)) return;
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
        <div className="mb-4 flex flex-wrap gap-2">
          {MODEL_PAGE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? "nav-active"
                  : "border border-border bg-white text-text-navy hover:bg-content-bg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
          }}
          placeholder={isTagsTab ? "Search tags..." : "Search models..."}
          className="mb-4"
        />
        {error && <div className="mb-4 alert-error">{error}</div>}
        <div className="models-table-scroll card">
          <table className="models-table">
            <thead>
              <tr>
                <th className="col-sno">S.NO.</th>
                <th className="col-image">{itemLabel} Image</th>
                <th className="col-name">Image Name</th>
                {!isTagsTab && <th className="col-description">Description</th>}
                <th className="col-date">Date Added</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {loading && (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-text-muted">
                    No {isTagsTab ? "tags" : "models"} yet. Upload using the panel on the right.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((item, index) => (
                  <tr key={item.id}>
                    <td className="col-sno">{index + 1}</td>
                    <td className="col-image">
                      {item.image_url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewItem(item)}
                          className="overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-button-blue"
                          title="Click to enlarge"
                        >
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-16 w-14 rounded object-contain bg-content-bg"
                          />
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="col-name">
                      <div className="truncate font-medium text-text-navy" title={item.name}>
                        {item.name}
                      </div>
                      {item.file_size ? (
                        <div className="text-[11px] text-text-muted">{formatFileSize(item.file_size)}</div>
                      ) : null}
                    </td>
                    {!isTagsTab && (
                      <td className="col-description">
                        {item.description?.trim() ? (
                          <button
                            type="button"
                            className="table-description-clamp w-full"
                            title="View full description"
                            onClick={() =>
                              setDescriptionPreview({
                                title: item.name,
                                text: item.description ?? "",
                              })
                            }
                          >
                            {item.description}
                          </button>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    )}
                    <td className="col-date text-text-muted">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="col-actions">
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                        <button
                          type="button"
                          className="text-button-blue"
                          onClick={() => {
                            setEditing(item);
                            setName(item.name);
                            setNameFromFile(false);
                            setDescription(item.description ?? "");
                            setFile(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-danger"
                          onClick={() => void handleDelete(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="split-layout-side split-layout-side-sticky card p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-navy">
          {editing ? `Edit ${itemLabel}` : `Add New ${itemLabel}`}
        </h3>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Upload {itemLabel} Image (one at a time)
            </span>
            <div className="group relative cursor-pointer rounded-lg border border-dashed border-border bg-white px-3 py-3 text-center transition-colors hover:border-button-blue/40 hover:bg-blue-soft/30">
              <div className="text-sm text-text-muted group-hover:text-button-blue">
                {file ? file.name : "Choose a single image file"}
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Image Name *</span>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameFromFile(false);
              }}
              className="input-field"
            />
            {nameFromFile && !editing && (
              <span className="mt-1 block text-xs text-text-muted">
                Auto-filled from filename
              </span>
            )}
          </label>
          {!isTagsTab && (
            <label className="block text-sm">
              <span className="mb-1.5 flex items-center justify-between font-medium">
                <span>Description *</span>
                <span
                  className={`text-xs font-normal ${
                    descriptionWordCount > MAX_DESCRIPTION_WORDS
                      ? "text-danger"
                      : "text-text-muted"
                  }`}
                >
                  {descriptionWordCount}/{MAX_DESCRIPTION_WORDS} words
                </span>
              </span>
              <textarea
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description (up to 500 words)..."
                className="input-field"
              />
            </label>
          )}
          <div className="flex gap-2">
            {editing && (
              <button type="button" className="btn-secondary flex-1" onClick={resetForm}>
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </aside>

      <ImagePreviewModal
        open={Boolean(previewItem)}
        title={previewItem?.name ?? `${itemLabel} preview`}
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

      {descriptionPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setDescriptionPreview(null)}
        >
          <div
            className="max-h-[min(80vh,520px)] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold uppercase text-button-blue">
                {descriptionPreview.title}
              </h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Description
              </p>
            </div>
            <div className="max-h-[min(60vh,420px)] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-text-navy whitespace-pre-wrap">
              {descriptionPreview.text}
            </div>
            <div className="border-t border-border px-5 py-4">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => setDescriptionPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
