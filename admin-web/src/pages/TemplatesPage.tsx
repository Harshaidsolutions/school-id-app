import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import api from "../api/client";
import { SearchInput } from "../components/ui/SearchInput";
import { UploadDropzone } from "../components/ui/UploadDropzone";
import { TemplateFormModal } from "../components/TemplateFormModal";
import { CatalogPreviewThumb, ImagePreviewModal } from "../components/ImagePreviewModal";
import { BulkActionBar, BulkModeButtons, bulkDeleteMessage } from "../components/BulkActionBar";
import type { ApiErrorBody, Template, TemplateOrientation } from "../types";
import { TEMPLATE_TABS as TABS } from "../types";

type TemplateTab = TemplateOrientation | "all";

function nameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || filename;
}

export function TemplatesPage() {
  const templateUploadRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TemplateTab>("all");
  const [uploadOrientation, setUploadOrientation] =
    useState<TemplateOrientation>("vertical_single");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ templates: Template[] }>("/admin/templates");
      setTemplates(data.templates);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to load templates.");
      } else setError("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  const templateRows = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return templates.filter((t) => {
      const inTab = tab === "all" || t.orientation === tab;
      const inSearch = !q || t.name.toLowerCase().includes(q);
      return inTab && inSearch;
    });
  }, [templates, tab, templateSearch]);

  const activeUploadOrientation: TemplateOrientation =
    tab === "all" ? uploadOrientation : tab;

  useEffect(() => {
    if (tab !== "all") {
      setUploadOrientation(tab);
    }
  }, [tab]);

  useEffect(() => {
    const first = pendingFiles[0];
    if (!first) {
      setPendingPreviewUrl(null);
      return;
    }
    if (first.type.startsWith("image/")) {
      const url = URL.createObjectURL(first);
      setPendingPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPendingPreviewUrl(null);
    return undefined;
  }, [pendingFiles]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await api.delete(`/admin/templates/${id}`);
      await loadTemplates();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Delete failed.");
      } else setError("Delete failed.");
    }
  }

  async function uploadSingleTemplate(file: File, orientation: TemplateOrientation) {
    const form = new FormData();
    form.append("name", nameFromFilename(file.name));
    form.append("orientation", orientation);
    form.append("image", file);
    await api.post("/admin/templates", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async function handleTemplateUploadSubmit() {
    if (pendingFiles.length === 0) return;

    setUploadingTemplate(true);
    setError(null);
    setUploadProgress(null);
    setUploadSuccess(false);
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i]!;
        setUploadProgress(`Uploading ${i + 1}/${pendingFiles.length}: ${file.name}`);
        await uploadSingleTemplate(file, activeUploadOrientation);
      }
      await loadTemplates();
      setUploadSuccess(true);
      setPendingFiles([]);
      if (templateUploadRef.current) templateUploadRef.current.value = "";
      setTimeout(() => setUploadSuccess(false), 2500);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Upload failed.");
      } else setError("Upload failed.");
    } finally {
      setUploadingTemplate(false);
      setUploadProgress(null);
    }
  }

  function handleTemplateFileSelect(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    setPendingFiles(list);
    setUploadSuccess(false);
    setError(null);
  }

  return (
    <div className="app-page space-y-4">
      {error && <div className="alert-error">{error}</div>}
      {uploadProgress && (
        <div className="alert-success">{uploadProgress}</div>
      )}

      <div className="split-layout">
        <div className="split-layout-main">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput
              value={templateSearch}
              onChange={setTemplateSearch}
              placeholder="Search templates by name..."
              className="min-w-[12rem] flex-1"
            />
            {(!loading && templateRows.length > 0) || selecting ? (
              <BulkModeButtons
                selecting={selecting}
                selectedCount={templateRows.filter((tpl) => selectedIds.has(tpl.id)).length}
                deleting={bulkDeleting}
                onStart={() => setSelecting(true)}
                onCancel={() => {
                  setSelectedIds(new Set());
                  setSelecting(false);
                }}
                onConfirm={() => {
                  const ids = templateRows
                    .filter((tpl) => selectedIds.has(tpl.id))
                    .map((tpl) => tpl.id);
                  if (ids.length === 0) return;
                  if (!confirm(`Delete ${ids.length} template${ids.length === 1 ? "" : "s"}?`)) {
                    return;
                  }
                  setBulkDeleting(true);
                  void api
                    .post<{ deletedCount: number; failedCount: number }>(
                      "/admin/templates/bulk-delete",
                      { ids }
                    )
                    .then(({ data }) => {
                      const message = bulkDeleteMessage(data);
                      setError(message);
                      setSelectedIds(new Set());
                      setSelecting(false);
                      return loadTemplates();
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
          {loading ? (
            <div className="text-sm text-text-muted">Loading templates…</div>
          ) : templateRows.length === 0 ? (
            <div className="card px-6 py-12 text-center text-sm text-text-muted">
              No templates in this category yet. Upload using the panel on the right.
            </div>
          ) : (
            <>
            {selecting ? (
            <BulkActionBar
              selectedCount={templateRows.filter((tpl) => selectedIds.has(tpl.id)).length}
              allSelected={
                templateRows.length > 0 &&
                templateRows.every((tpl) => selectedIds.has(tpl.id))
              }
              onToggleAll={() => {
                setSelectedIds((prev) => {
                  const all = templateRows.every((tpl) => prev.has(tpl.id));
                  if (all) return new Set();
                  return new Set(templateRows.map((tpl) => tpl.id));
                });
              }}
            />
            ) : null}
            <div className="card-grid-responsive">
              {templateRows.map((tpl) => (
                <div key={tpl.id} className="card overflow-hidden">
                  {selecting ? (
                  <label className="flex items-center gap-2 px-3 pt-3 text-xs text-text-muted">
                    <input
                      type="checkbox"
                      className="bulk-check"
                      checked={selectedIds.has(tpl.id)}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tpl.id)) next.delete(tpl.id);
                          else next.add(tpl.id);
                          return next;
                        });
                      }}
                    />
                    Select
                  </label>
                  ) : null}
                  <CatalogPreviewThumb
                    imageUrl={tpl.image_url}
                    alt={tpl.name}
                    className="max-h-64 w-full object-contain bg-content-bg p-2"
                    onClick={() => setPreviewTemplate(tpl)}
                  />
                  <div className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text-navy">{tpl.name}</div>
                      <div className="text-xs text-text-muted">
                        {TABS.find((t) => t.key === tpl.orientation)?.label ?? tpl.orientation}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs font-medium">
                      <button
                        type="button"
                        className="text-button-blue hover:underline"
                        onClick={() => {
                          setEditTemplate(tpl);
                          setShowAddModal(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-danger hover:underline"
                        onClick={() => void handleDelete(tpl.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

        <aside className="split-layout-side split-layout-side-sticky space-y-4">
          <div className="panel-right">
            <h3 className="mb-3 text-sm font-semibold text-text-navy">Template Type</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setTab("all")}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  tab === "all"
                    ? "nav-active"
                    : "bg-content-bg text-text-navy hover:bg-orange-soft"
                }`}
              >
                All
              </button>
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    tab === item.key
                      ? "nav-active"
                      : "bg-content-bg text-text-navy hover:bg-orange-soft"
                  }`}
                >
                  {item.label.replace(" – ", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-right">
            <h3 className="mb-3 text-sm font-semibold text-text-navy">Upload Templates</h3>
            {tab === "all" && (
              <label className="mb-3 block text-sm">
                <span className="mb-1.5 block font-medium text-text-muted">
                  Category for new uploads
                </span>
                <select
                  value={uploadOrientation}
                  onChange={(e) =>
                    setUploadOrientation(e.target.value as TemplateOrientation)
                  }
                  className="input-field"
                >
                  {TABS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <UploadDropzone
              title={
                pendingFiles.length > 0
                  ? `${pendingFiles.length} file(s) selected`
                  : "Click to choose template files"
              }
              hint="Select one or more JPG, PNG or PDF files (Max 10MB each)"
              uploading={uploadingTemplate}
              onClick={() => templateUploadRef.current?.click()}
            />
            {pendingPreviewUrl && (
              <div className="mt-3 overflow-hidden rounded-lg border border-border bg-content-bg p-2">
                <img
                  src={pendingPreviewUrl}
                  alt="Selected template preview"
                  className="mx-auto max-h-48 w-full object-contain"
                />
              </div>
            )}
            {pendingFiles.length > 0 && !pendingPreviewUrl && (
              <div className="mt-3 rounded-lg border border-border bg-content-bg px-3 py-4 text-center text-sm text-text-muted">
                {pendingFiles.map((f) => f.name).join(", ")}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={pendingFiles.length === 0 || uploadingTemplate}
                onClick={() => void handleTemplateUploadSubmit()}
                className="btn-primary flex-1"
              >
                {uploadingTemplate ? "Submitting…" : "Submit"}
              </button>
              {uploadSuccess && (
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600" title="Uploaded">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </div>
            <input
              ref={templateUploadRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => {
                handleTemplateFileSelect(e.target.files);
              }}
            />
          </div>
        </aside>
      </div>

      {showAddModal && (
        <TemplateFormModal
          template={editTemplate}
          defaultOrientation={tab === "all" ? uploadOrientation : tab}
          onClose={() => {
            setShowAddModal(false);
            setEditTemplate(null);
          }}
          onSaved={() => {
            void loadTemplates();
          }}
        />
      )}

      <ImagePreviewModal
        open={Boolean(previewTemplate)}
        title={previewTemplate?.name ?? "Template preview"}
        imageUrl={previewTemplate?.image_url}
        onClose={() => setPreviewTemplate(null)}
        hasPrevious={
          previewTemplate
            ? templateRows.findIndex((t) => t.id === previewTemplate.id) > 0
            : false
        }
        hasNext={
          previewTemplate
            ? templateRows.findIndex((t) => t.id === previewTemplate.id) <
              templateRows.length - 1
            : false
        }
        onPrevious={() => {
          if (!previewTemplate) return;
          const idx = templateRows.findIndex((t) => t.id === previewTemplate.id);
          if (idx > 0) setPreviewTemplate(templateRows[idx - 1] ?? null);
        }}
        onNext={() => {
          if (!previewTemplate) return;
          const idx = templateRows.findIndex((t) => t.id === previewTemplate.id);
          if (idx >= 0 && idx < templateRows.length - 1) {
            setPreviewTemplate(templateRows[idx + 1] ?? null);
          }
        }}
      />
    </div>
  );
}
