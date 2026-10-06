import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import api from "../api/client";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import type { FormFieldConfig } from "../constants/formFields";
import {
  formFieldRowId,
  isManualFormField,
  sortFormFields,
  withSequentialDisplayOrder,
} from "../constants/formFields";
import type { ApiErrorBody, StudentsResponse } from "../types";

export type { FormFieldConfig };

async function loadFormFieldsForOrg(options: {
  schoolId: string;
  instituteId: string;
  organizationId: string;
}): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId, organizationId } = options;
  if (organizationId) {
    const { data } = await api.get<{form: {fields: Array<{id:string;field_name:string;field_type:"text"|"photo";enabled:boolean;required:boolean}>} | null}>(`/admin/organizations/${organizationId}`);
    return (data.form?.fields ?? []).map((f,i) => ({key:f.id, organizationFieldId:f.id, label:f.field_name, fieldType:f.field_type, enabled:f.enabled !== false, required:f.required !== false, source:"manual", displayOrder:i}));
  }
  const orgParams = schoolId ? { schoolId } : { instituteId };

  const { data } = await api.get<{
    fields: FormFieldConfig[];
    studentCount?: number;
    importBatchCount?: number;
  }>("/admin/form-config", { params: orgParams });

  let fields = Array.isArray(data.fields) ? sortFormFields(data.fields) : [];
  const reportedCount = (data.studentCount ?? 0) + (data.importBatchCount ?? 0);

  if (fields.length === 0 && reportedCount > 0) {
    const retry = await api.get<{ fields: FormFieldConfig[] }>("/admin/form-config", {
      params: { ...orgParams, rebuild: "true" },
    });
    fields = Array.isArray(retry.data.fields) ? sortFormFields(retry.data.fields) : [];
  }

  if (fields.length === 0) {
    const studentsRes = await api.get<StudentsResponse>("/admin/students", {
      params: orgParams,
    });
    if ((studentsRes.data.students?.length ?? 0) > 0) {
      const sync = await api.post<{ fields: FormFieldConfig[] }>("/admin/form-config/sync", orgParams);
      fields = Array.isArray(sync.data.fields) ? sortFormFields(sync.data.fields) : [];
    }
  }

  return fields;
}

function DragHandleIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-text-muted"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="4" r="1.25" />
      <circle cx="11" cy="4" r="1.25" />
      <circle cx="5" cy="8" r="1.25" />
      <circle cx="11" cy="8" r="1.25" />
      <circle cx="5" cy="12" r="1.25" />
      <circle cx="11" cy="12" r="1.25" />
    </svg>
  );
}

function SortableFieldRow({
  field,
  rowId,
  editingKey,
  editLabel,
  setEditLabel,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onToggle,
  onConfigure,
}: {
  field: FormFieldConfig;
  rowId: string;
  editingKey: string | null;
  editLabel: string;
  setEditLabel: (value: string) => void;
  onStartEdit: (field: FormFieldConfig, rowId: string) => void;
  onSaveEdit: (rowId: string) => void;
  onCancelEdit: () => void;
  onRemove: (rowId: string) => void;
  onToggle: (rowId: string) => void;
  onConfigure?: (rowId: string, patch: Partial<FormFieldConfig>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${
        isDragging ? "relative z-10 bg-white shadow-md ring-2 ring-button-blue/30" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          className="form-setup-drag-handle flex shrink-0 touch-none items-center rounded p-1 hover:bg-content-bg"
          aria-label={`Drag to reorder ${field.label}`}
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon />
        </button>

        {editingKey === rowId ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="input-field flex-1"
              autoFocus
            />
            <button
              type="button"
              className="btn-primary px-3 py-2 text-xs"
              onClick={() => onSaveEdit(rowId)}
            >
              Save
            </button>
            <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-text-navy">{field.label}</span>
            <button
              type="button"
              onClick={() => onStartEdit(field, rowId)}
              className="ml-2 text-xs font-medium text-button-blue hover:underline"
            >
              Edit
            </button>
            {isManualFormField(field) && field.key !== "signature_upload" && (
              <button
                type="button"
                onClick={() => onRemove(rowId)}
                className="ml-2 text-xs font-medium text-danger hover:underline"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      {onConfigure ? <div className="flex items-center gap-3">
        <select aria-label={`${field.label} type`} className="input-field w-auto" value={field.fieldType ?? "text"} disabled={Boolean(field.organizationFieldId)} onChange={e => onConfigure(rowId, {fieldType:e.target.value as "text"|"photo"})}><option value="text">Text / Data</option><option value="photo">Image / Photo</option></select>
        <label className="flex items-center gap-2">Required <ToggleSwitch checked={field.required !== false} label={`${field.label} required`} onChange={() => onConfigure(rowId, {required:field.required === false})} /></label>
      </div> : null}
      <ToggleSwitch
        checked={field.enabled}
        onChange={() => onToggle(rowId)}
        label={`${field.label} enabled`}
      />
    </li>
  );
}

export function FormSetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get("organizationId") ?? "";
  const schoolId = searchParams.get("schoolId") ?? "";
  const instituteId = searchParams.get("instituteId") ?? "";
  const backHref = organizationId ? `/extra-2/${encodeURIComponent(organizationId)}` : schoolId
    ? `/students?schoolId=${encodeURIComponent(schoolId)}${searchParams.get("schoolName") ? `&schoolName=${encodeURIComponent(searchParams.get("schoolName")!)}` : ""}`
    : instituteId
      ? `/institute-members?instituteId=${encodeURIComponent(instituteId)}${searchParams.get("instituteName") ? `&instituteName=${encodeURIComponent(searchParams.get("instituteName")!)}` : ""}`
      : "/students";

  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!schoolId && !instituteId && !organizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextFields = await loadFormFieldsForOrg({ schoolId, instituteId, organizationId });
        if (!cancelled) setFields(nextFields);
      } catch (err) {
        if (!cancelled) {
          setFields([]);
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Failed to load form setup.");
          } else {
            setError("Failed to load form setup.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [schoolId, instituteId, organizationId]);

  function reorderFields(next: FormFieldConfig[]) {
    setFields(withSequentialDisplayOrder(next));
    setSuccess(null);
  }

  function indexForRowId(list: FormFieldConfig[], rowId: string): number {
    return list.findIndex((f, i) => formFieldRowId(f, i) === rowId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = indexForRowId(fields, String(active.id));
    const newIndex = indexForRowId(fields, String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderFields(arrayMove(fields, oldIndex, newIndex));
  }

  function toggleField(rowId: string) {
    const idx = indexForRowId(fields, rowId);
    if (idx < 0) return;
    setFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, enabled: !f.enabled } : f))
    );
    setSuccess(null);
  }

  function startEdit(field: FormFieldConfig, rowId: string) {
    setEditingKey(rowId);
    setEditLabel(field.label);
  }

  function saveEdit(rowId: string) {
    const label = editLabel.trim();
    if (!label) return;
    const idx = indexForRowId(fields, rowId);
    if (idx < 0) return;
    setFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, label } : f))
    );
    setEditingKey(null);
    setSuccess(null);
  }

  function removeField(rowId: string) {
    const idx = indexForRowId(fields, rowId);
    if (idx < 0) return;
    const target = fields[idx];
    if (target && (!isManualFormField(target) || target.key === "signature_upload")) return;
    reorderFields(fields.filter((_, i) => i !== idx));
    setEditingKey((current) => (current === rowId ? null : current));
  }

  function addCustomField() {
    const label = newFieldLabel.trim();
    if (!label) return;

    const labelKey = label.toLowerCase();
    if (fields.some((f) => f.label.trim().toLowerCase() === labelKey)) {
      setError("This field already exists.");
      setSuccess(null);
      return;
    }

    const used = new Set(fields.map((f) => f.key));
    const baseSlug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "field";
    let key = `dyn_${baseSlug}`;
    let n = 2;
    while (used.has(key)) {
      key = `dyn_${baseSlug}_${n}`;
      n += 1;
    }

    setError(null);
    reorderFields([
      ...fields,
      { key, label, enabled: true, source: "manual" as const, displayOrder: fields.length },
    ]);
    setNewFieldLabel("");
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!schoolId && !instituteId && !organizationId) {
      setError("Open Form Setup from a school or institute to save field configuration.");
      return;
    }
    if (fields.length === 0) {
      setError("No fields to save. Import students via Excel first, or add a custom field.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = withSequentialDisplayOrder(fields);
      if (organizationId) {
        await api.post(`/admin/organizations/${organizationId}/forms`, {fields:payload.map(f => ({id:f.organizationFieldId,fieldName:f.label,fieldType:f.fieldType ?? "text",enabled:f.enabled,required:f.required !== false}))});
      } else await api.put("/admin/form-config", {
        schoolId: schoolId || undefined,
        instituteId: instituteId || undefined,
        fields: payload,
      });
      setSuccess("Form setup saved. Student list columns will update when you go back.");
      navigate(backHref);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to save form setup.");
      } else setError("Failed to save form setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="centered-page-shell">
      <Link to={backHref} className="mb-4 self-start text-sm font-medium text-button-blue hover:underline">
        ← Back
      </Link>

      {error && <div className="w-full alert-error">{error}</div>}
      {success && <div className="mt-4 w-full alert-success">{success}</div>}

      {loading ? (
        <div className="mt-6 text-sm text-text-muted">Loading form fields from imported data…</div>
      ) : fields.length === 0 && !organizationId ? (
        <div className="centered-page-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-text-navy">No form fields yet</p>
          <p className="mt-2 text-sm text-text-muted">
            Upload an Excel file for this {instituteId ? "institute" : "school"} first.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="centered-page-card">
          <div className="border-b border-border px-5 py-3 text-center text-xs text-text-muted">
            {organizationId ? "Drag fields to reorder. Configure field names, required details, and visibility. Removed fields with existing data are disabled to preserve records." : "Drag fields to reorder. Excel fields can be edited and toggled. Only manually added fields can be deleted."}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={fields.map((f, i) => formFieldRowId(f, i))}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-border">
                {fields.map((field, index) => {
                  const rowId = formFieldRowId(field, index);
                  return (
                  <SortableFieldRow
                    key={rowId}
                    field={field}
                    rowId={rowId}
                    editingKey={editingKey}
                    editLabel={editLabel}
                    setEditLabel={setEditLabel}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => setEditingKey(null)}
                    onRemove={removeField}
                    onToggle={toggleField}
                    onConfigure={organizationId ? (id, patch) => setFields(current => current.map((f,i) => formFieldRowId(f,i) === id ? {...f,...patch} : f)) : undefined}
                  />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>

          <div className="border-t border-border px-5 py-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm">
                <span className="mb-1 block font-medium text-text-navy">New custom field name</span>
                <input
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="Enter custom field name"
                  className="input-field"
                />
              </label>
              <button type="button" onClick={addCustomField} className="btn-secondary shrink-0">
                + Add field
              </button>
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <button type="submit" disabled={saving} className="btn-primary uppercase tracking-wide">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
