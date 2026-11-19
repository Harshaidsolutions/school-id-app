import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import { ImagePreviewModal } from "../components/ImagePreviewModal";
import { SearchInput } from "../components/ui/SearchInput";
import { formatFileSize } from "./CatalogPages";
import { BulkActionBar, BulkModeButtons, bulkDeleteMessage } from "../components/BulkActionBar";
import type { ApiErrorBody, CatalogItem } from "../types";
import { sequentialUploadProgressLabel } from "../utils/sequentialUploadProgress";

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
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tagFiles, setTagFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);
  const [descriptionPreview, setDescriptionPreview] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const [counts, setCounts] = useState<Record<string, number>>({});
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
      const rows = data.items.filter((item) => item.kind === tab);
      setItems(rows);
      setCounts((prev) => ({ ...prev, [tab]: rows.length }));
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

  // Counts for both tabs (ID Card Models / ID Card Tags).
  useEffect(() => {
    for (const t of MODEL_PAGE_TABS) {
      void api
        .get<{ items: CatalogItem[] }>("/admin/catalog", { params: { kind: t.key } })
        .then(({ data }) => setCounts((prev) => ({ ...prev, [t.key]: data.items.filter((item) => item.kind === t.key).length })))
        .catch(() => undefined);
    }
  }, []);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true;
      if (isTagsTab) return false;
      return (item.description ?? "").toLowerCase().includes(q);
    });
  }, [items, search, isTagsTab]);

  const tableColSpan = (isTagsTab ? 5 : 6) + (selecting ? 1 : 0);

  /** Every image of every item in the list, so the preview steps through all of them. */
  const gallery = useMemo(
    () =>
      filtered.flatMap((item) => {
        const pics = [item.image_url, ...(item.extra_image_urls ?? [])].filter((u): u is string => Boolean(u));
        return pics.map((src, k) => ({ item, src, k, n: pics.length }));
      }),
    [filtered]
  );
  const [previewAt, setPreviewAt] = useState(0);
  const openPreview = (item: CatalogItem, k = 0) => {
    const at = gallery.findIndex((g) => g.item.id === item.id && g.k === k);
    setPreviewAt(Math.max(0, at));
    setPreviewItem(item);
  };
  const shown = previewItem ? gallery[previewAt] : undefined;

  function resetForm() {
    setEditing(null);
    setName("");
    setNameFromFile(false);
    setDescription("");
    setVideoFile(null);
    setTagFiles([]);
  }

  function handleTagFilesSelect(list: FileList | null) {
    if (!list?.length) {
      setTagFiles([]);
      return;
    }
    const picked = Array.from(list);
    setTagFiles(picked);
    if (!editing && picked[0]) {
      setName(nameFromFilename(picked[0].name));
      setNameFromFile(true);
    }
  }

  /** Removes one of the extra images of the item being edited. */
  async function removeExtraImage(url: string) {
    if (!editing) return;
    try {
      const { data } = await api.delete<{ item: CatalogItem }>(`/admin/catalog/${editing.id}/extra-images`, { data: { url } });
      if (data.item) setEditing(data.item);
      await load();
    } catch {
      setError("Could not remove the image.");
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
    setUploadProgress(null);
    try {
      // Several images can be chosen at once: the first is the main picture, the others are extra images.
      const addExtras = async (itemId: string, files: File[], offset: number, total: number) => {
        for (let i = 0; i < files.length; i += 1) {
          const f = files[i]!;
          setUploadProgress(sequentialUploadProgressLabel(offset + i + 1, total, f.name));
          const extraForm = new FormData();
          extraForm.append("file", f);
          await api.post(`/admin/catalog/${itemId}/extra-images`, extraForm, { headers: { "Content-Type": "multipart/form-data" } });
        }
      };
      const total = tagFiles.length;
      const form = new FormData();
      form.append("kind", tab);
      form.append("name", name.trim());
      form.append("description", isTagsTab ? "" : description.trim());
      if (videoFile) form.append("video", videoFile);
      if (editing) {
        // Editing: new images are added to the ones already there (remove old ones with × above).
        const replaceMain = !editing.image_url && tagFiles.length > 0;
        if (replaceMain) form.append("file", tagFiles[0]!);
        if (total) setUploadProgress(sequentialUploadProgressLabel(1, total, tagFiles[0]!.name));
        await api.put(`/admin/catalog/${editing.id}`, form, { headers: { "Content-Type": "multipart/form-data" } });
        await addExtras(editing.id, replaceMain ? tagFiles.slice(1) : tagFiles, replaceMain ? 1 : 0, total);
      } else {
        if (!tagFiles.length && !videoFile) throw new Error("Add an image or a video");
        if (tagFiles[0]) {
          form.append("file", tagFiles[0]);
          setUploadProgress(sequentialUploadProgressLabel(1, total, tagFiles[0].name));
        }
        const { data } = await api.post<{ item: CatalogItem }>(`/admin/catalog?kind=${encodeURIComponent(tab)}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (data.item?.id) await addExtras(data.item.id, tagFiles.slice(1), 1, total);
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
      setUploadProgress(null);
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
              {t.label}{counts[t.key] !== undefined ? ` (${counts[t.key]})` : ""}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
            }}
            placeholder={isTagsTab ? "Search tags..." : "Search models..."}
            className="min-w-[12rem] flex-1"
          />
          {(!loading && filtered.length > 0) || selecting ? (
            <BulkModeButtons
              selecting={selecting}
              selectedCount={filtered.filter((item) => selectedIds.has(item.id)).length}
              deleting={bulkDeleting}
              onStart={() => setSelecting(true)}
              onCancel={() => {
                setSelectedIds(new Set());
                setSelecting(false);
              }}
              onConfirm={() => {
                const ids = filtered.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
                if (ids.length === 0) return;
                const noun = isTagsTab ? "tag" : "model";
                if (!confirm(`Delete ${ids.length} ${noun}${ids.length === 1 ? "" : "s"}?`)) return;
                setBulkDeleting(true);
                void api
                  .post<{ deletedCount: number; failedCount: number }>(
                    "/admin/catalog/bulk-delete",
                    { ids }
                  )
                  .then(({ data }) => {
                    setError(bulkDeleteMessage(data));
                    setSelectedIds(new Set());
                    setSelecting(false);
                    return load();
                  })
                  .catch((err: unknown) => {
                    if (axios.isAxiosError(err)) {
                      const body = err.response?.data as ApiErrorBody | undefined;
                      setError(body?.message ?? "Bulk delete failed.");
                    } else setError("Bulk delete failed.");
                  })
                  .finally(() => setBulkDeleting(false));
              }}
            />
          ) : null}
        </div>
        {error && <div className="mb-4 alert-error">{error}</div>}
        {selecting && !loading && filtered.length > 0 ? (
          <BulkActionBar
            selectedCount={filtered.filter((item) => selectedIds.has(item.id)).length}
            allSelected={filtered.every((item) => selectedIds.has(item.id))}
            onToggleAll={() => {
              setSelectedIds((prev) => {
                const all = filtered.every((item) => prev.has(item.id));
                if (all) return new Set();
                return new Set(filtered.map((item) => item.id));
              });
            }}
          />
        ) : null}
        {uploadProgress && <div className="mb-4 alert-success">{uploadProgress}</div>}
        <div className="models-table-scroll card">
          <table className="models-table">
            <thead>
              <tr>
                {selecting ? (
                  <th className="bulk-check-cell">
                    <input
                      type="checkbox"
                      className="bulk-check"
                      aria-label={isTagsTab ? "Select all tags" : "Select all models"}
                      checked={
                        filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id))
                      }
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const all = filtered.every((item) => prev.has(item.id));
                          if (all) return new Set();
                          return new Set(filtered.map((item) => item.id));
                        });
                      }}
                    />
                  </th>
                ) : null}
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
                    {selecting ? (
                      <td className="bulk-check-cell">
                        <input
                          type="checkbox"
                          className="bulk-check"
                          aria-label={`Select ${item.name}`}
                          checked={selectedIds.has(item.id)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="col-sno">{index + 1}</td>
                    <td className="col-image">
                      {(() => {
                        const pics = [item.image_url, ...(item.extra_image_urls ?? [])].filter((u): u is string => Boolean(u));
                        if (!pics.length) return "—";
                        // Tags: show every image (no "+N"); models keep a single thumbnail.
                        const shownPics = isTagsTab ? pics : pics.slice(0, 1);
                        return (
                          <div className="catalog-thumbs">
                            {shownPics.map((url, k) => (
                              <button
                                key={k}
                                type="button"
                                onClick={() => openPreview(item, k)}
                                className="relative overflow-hidden transition hover:opacity-90"
                                title="Click to enlarge"
                              >
                                <img src={url} alt={`${item.name} ${k + 1}`} className="h-16 w-14 object-contain bg-content-bg" />
                                {!isTagsTab && pics.length > 1 ? <span className="catalog-count">+{pics.length - 1}</span> : null}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                      {item.video_url ? (
                        <video
                          src={item.video_url}
                          controls
                          playsInline
                          preload="metadata"
                          controlsList="nodownload"
                          className="mt-2 h-16 w-24 bg-[#EEF0FF]"
                        />
                      ) : null}
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
                            className="table-description-full w-full"
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
                            setTagFiles([]);
                            setVideoFile(null);
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
          {editing && (editing.image_url || (editing.extra_image_urls?.length ?? 0) > 0) ? (
            <div className="catalog-current">
              <span className="mb-1.5 block text-sm font-medium">Current images ({1 + (editing.extra_image_urls?.length ?? 0)})</span>
              <div className="catalog-thumbs">
                {editing.image_url ? (
                  <figure>
                    <button type="button" onClick={() => openPreview(editing, 0)} title="View"><img src={editing.image_url} alt={`${editing.name} main`} /></button>
                    <figcaption>Main</figcaption>
                  </figure>
                ) : null}
                {(editing.extra_image_urls ?? []).map((url, k) => (
                  <figure key={url}>
                    <button type="button" onClick={() => openPreview(editing, k + (editing.image_url ? 1 : 0))} title="View"><img src={url} alt={`${editing.name} ${k + 2}`} /></button>
                    <button type="button" className="catalog-thumb-x" aria-label="Remove this image" onClick={() => { if (confirm("Remove this image?")) void removeExtraImage(url); }}>×</button>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              {editing ? `Add ${itemLabel} Image(s)` : `Upload ${itemLabel} Image(s)`}
            </span>
            <div className="group relative cursor-pointer rounded-lg border border-dashed border-border bg-white px-3 py-3 text-center transition-colors hover:border-button-blue/40 hover:bg-blue-soft/30">
              <div className="text-sm text-text-muted group-hover:text-button-blue">
                {tagFiles.length > 0
                  ? `${tagFiles.length} file${tagFiles.length === 1 ? "" : "s"} selected`
                  : "Choose one or more images (hold Ctrl / Shift to pick several)"}
              </div>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => handleTagFilesSelect(e.target.files)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
          </label>
          {!isTagsTab ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Upload model video</span>
              <div className="group relative cursor-pointer rounded-lg border border-dashed border-border bg-white px-3 py-3 text-center transition-colors hover:border-button-blue/40 hover:bg-blue-soft/30">
                <div className="text-sm text-text-muted group-hover:text-button-blue">
                  {videoFile ? videoFile.name : "Choose Video"}
                </div>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </div>

              {videoFile ? (
                <button type="button" className="mt-1 text-xs text-danger" onClick={() => setVideoFile(null)}>
                  Remove video
                </button>
              ) : (
                <p className="mt-1 text-xs text-text-muted">MP4, WEBM, or MOV. Up to 50MB.</p>
              )}
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Image Name *</span>
            <input
              required
              value={name}
              readOnly={Boolean(editing)}
              disabled={Boolean(editing)}
              title={editing ? "The image name cannot be changed" : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameFromFile(false);
              }}
              className={`input-field ${editing ? "cursor-not-allowed bg-content-bg text-text-muted" : ""}`}
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
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Saving…" : "Submit"}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              disabled={saving || !(editing || videoFile || tagFiles.length || name || description)}
              onClick={(e) => {
                resetForm();
                const form = (e.currentTarget as HTMLButtonElement).form;
                form?.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => (input.value = ""));
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </aside>

      <ImagePreviewModal
        open={Boolean(previewItem && shown)}
        title={shown ? `${shown.item.name}${shown.n > 1 ? ` (${shown.k + 1}/${shown.n})` : ""}` : `${itemLabel} preview`}
        imageUrl={shown?.src}
        index={shown ? previewAt : undefined}
        total={gallery.length}
        onClose={() => setPreviewItem(null)}
        hasPrevious={previewAt > 0}
        hasNext={previewAt < gallery.length - 1}
        onPrevious={() => setPreviewAt((i) => Math.max(0, i - 1))}
        onNext={() => setPreviewAt((i) => Math.min(gallery.length - 1, i + 1))}
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
              <h2 className="text-lg font-semibold text-text-navy">
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
