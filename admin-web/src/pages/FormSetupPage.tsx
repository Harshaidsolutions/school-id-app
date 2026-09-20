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
  isManualFormField,
  sortFormFields,
  withSequentialDisplayOrder,
} from "../constants/formFields";
import type { ApiErrorBody, StudentsResponse } from "../types";

export type { FormFieldConfig };

async function loadFormFieldsForOrg(options: {
  schoolId: string;
  instituteId: string;
}): Promise<FormFieldConfig[]> {
  const { schoolId, instituteId } = options;
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
  editingKey,
  editLabel,
  setEditLabel,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onToggle,
}: {
  field: FormFieldConfig;
  editingKey: string | null;
  editLabel: string;
  setEditLabel: (value: string) => void;
  onStartEdit: (field: FormFieldConfig) => void;
  onSaveEdit: (key: string) => void;
  onCancelEdit: () => void;
  onRemove: (key: string) => void;
  onToggle: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key,
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

        {editingKey === field.key ? (
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
              onClick={() => onSaveEdit(field.key)}
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
              onClick={() => onStartEdit(field)}
              className="ml-2 text-xs font-medium text-button-blue hover:underline"
            >
              Edit
            </button>
            {isManualFormField(field) && (
              <button
                type="button"
                onClick={() => onRemove(field.key)}
                className="ml-2 text-xs font-medium text-danger hover:underline"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      <ToggleSwitch
        checked={field.enabled}
        onChange={() => onToggle(field.key)}
        label={`${field.label} enabled`}
      />
    </li>
  );
}

export function FormSetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const schoolId = searchParams.get("schoolId") ?? "";
  const instituteId = searchParams.get("instituteId") ?? "";
  const backHref = schoolId
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
    if (!schoolId && !instituteId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextFields = await loadFormFieldsForOrg({ schoolId, instituteId });
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
  }, [schoolId, instituteId]);

  function reorderFields(next: FormFieldConfig[]) {
    setFields(withSequentialDisplayOrder(next));
    setSuccess(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.key === active.id);
    const newIndex = fields.findIndex((f) => f.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderFields(arrayMove(fields, oldIndex, newIndex));
  }

  function toggleField(key: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
    setSuccess(null);
  }

  function startEdit(field: FormFieldConfig) {
    setEditingKey(field.key);
    setEditLabel(field.label);
  }

  function saveEdit(key: string) {
    const label = editLabel.trim();
    if (!label) return;
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, label } : f)));
    setEditingKey(null);
    setSuccess(null);
  }

  function removeField(key: string) {
    const target = fields.find((f) => f.key === key);
    if (target && !isManualFormField(target)) return;
    reorderFields(fields.filter((f) => f.key !== key));
    setEditingKey((current) => (current === key ? null : current));
  }

  function addCustomField() {
    const label = newFieldLabel.trim();
    if (!label) return;

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
    if (!schoolId && !instituteId) {
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
      await api.put("/admin/form-config", {
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
      ) : fields.length === 0 ? (
        <div className="centered-page-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-text-navy">No form fields yet</p>
          <p className="mt-2 text-sm text-text-muted">
            Upload an Excel file for this {instituteId ? "institute" : "school"} first.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="centered-page-card">
          <div className="border-b border-border px-5 py-3 text-center text-xs text-text-muted">
            Drag fields to reorder. Excel fields can be edited and toggled. Only manually added fields
            can be deleted.
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {fields.map((field) => (
                  <SortableFieldRow
                    key={field.key}
                    field={field}
                    editingKey={editingKey}
                    editLabel={editLabel}
                    setEditLabel={setEditLabel}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => setEditingKey(null)}
                    onRemove={removeField}
                    onToggle={toggleField}
                  />
                ))}
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
