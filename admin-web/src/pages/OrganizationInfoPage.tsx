import { HeaderBack } from "../components/HeaderBack";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { ImagePreviewModal } from "../components/ImagePreviewModal";
import { OrgAppSettings } from "../components/OrgAppSettings";
import { PasswordCell } from "../components/PasswordCell";
import type { ApiErrorBody } from "../types";

type TagSelectionItem = {
  name: string;
  image_url: string | null;
};

type OrganizationSelections = {
  model?: string | null;
  tags?: string | null;
  template_name?: string | null;
  model_image_url?: string | null;
  template_image_url?: string | null;
  tag_items?: TagSelectionItem[];
};

type SchoolOrganization = OrganizationSelections & {
  id: string;
  name: string;
  year: string | null;
  phone: string | null;
  phone2?: string | null;
  school_code: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  organization_photo_url?: string | null;
  field_visibility?: Record<string, boolean> | null;
  allow_number_edit?: boolean | null;
  allow_record_edit?: boolean | null;
  show_captured_section?: boolean | null;
};

type InstituteOrganization = OrganizationSelections & {
  phone2?: string | null;
  id: string;
  name: string;
  year: string | null;
  phone: string | null;
  institute_code: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  organization_photo_url?: string | null;
  field_visibility?: Record<string, boolean> | null;
  allow_number_edit?: boolean | null;
  allow_record_edit?: boolean | null;
  show_captured_section?: boolean | null;
};

function DetailSwitch({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className={`inline-flex h-8 items-center gap-2 rounded-full border px-1.5 text-xs font-semibold disabled:opacity-60 ${
        on ? "border-[#A5B4FC] bg-[#EEF0FF] text-[#4338CA]" : "border-[#E6E4F5] bg-[#F7F7FC] text-[#77759A]"
      }`}
    >
      <span
        className={`h-6 w-11 rounded-full p-0.5 transition ${on ? "bg-[#4F46E5]" : "bg-[#D4D1EC]"}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white shadow ${on ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      {on ? "ON" : "OFF"}
    </button>
  );
}

function InfoRow({
  label,
  value,
  showWhenEmpty,
  emptyLabel = "-",
  control,
  secret,
  onSaveValue,
  onDeleteValue,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  showWhenEmpty?: boolean;
  emptyLabel?: string;
  control?: ReactNode;
  secret?: string;
  onSaveValue?: (next: string) => void;
  onDeleteValue?: () => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const startEdit = () => { setDraft(value?.trim() ?? ""); setEditing(true); };
  const actions = (
    <div className="flex items-center gap-3">
      {onSaveValue ? (
        <button type="button" onClick={startEdit} className="text-xs font-semibold text-button-blue hover:underline">Edit</button>
      ) : null}
      {onDeleteValue && value?.trim() ? (
        <button type="button" onClick={onDeleteValue} className="text-xs font-semibold text-danger hover:underline">Delete</button>
      ) : null}
      {control}
    </div>
  );
  const display = value?.trim()
    ? value.trim()
    : showWhenEmpty
      ? emptyLabel
      : "-";
  const body =
    editing && onSaveValue ? (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {multiline ? (
          <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} className="input-field w-full sm:w-72" />
        ) : (
          <input value={draft} onChange={(e) => setDraft(e.target.value)} className="input-field w-full sm:w-72" />
        )}
        <button type="button" onClick={() => { onSaveValue(draft.trim()); setEditing(false); }} className="btn-primary px-3 py-1 text-xs">Save</button>
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary px-3 py-1 text-xs">Cancel</button>
      </div>
    ) : secret && value?.trim() ? (
      <div className="mt-1 text-sm text-text-navy"><PasswordCell value={value} label={secret} /></div>
    ) : (
      <div className="mt-1 whitespace-pre-wrap text-sm text-text-navy">{display}</div>
    );
  return (
    <div className="org-info-row flex items-start justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
        {body}
      </div>
      {actions}
    </div>
  );
}

function ImageBlock({
  label,
  url,
  caption,
  onPreview,
  control,
  onDelete,
  onReplace,
}: {
  label: string;
  url: string | null | undefined;
  caption?: string | null;
  onPreview: (label: string, url: string) => void;
  control?: ReactNode;
  onDelete?: () => void;
  onReplace?: (file: File) => void;
}) {
  if (!url?.trim()) {
    return (
      <div className="org-info-row flex items-start justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
          <div className="mt-1 text-sm text-text-navy">-</div>
        </div>
        <div className="flex items-center gap-3">
          {onReplace ? (
            <label className="cursor-pointer text-xs font-semibold text-button-blue hover:underline">
              Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.currentTarget.value = ""; }} />
            </label>
          ) : null}
          {control}
        </div>
      </div>
    );
  }
  return (
    <div className="org-info-media border-b border-border px-5 py-4 last:border-b-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
        <div className="flex items-center gap-3">
          {onReplace ? (
            <label className="cursor-pointer text-xs font-semibold text-button-blue hover:underline">
              Replace
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.currentTarget.value = ""; }} />
            </label>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="text-xs font-semibold text-danger hover:underline">Delete</button>
          ) : null}
          {control}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onPreview(label, url)}
        className="block w-full max-w-md overflow-hidden bg-content-bg transition hover:opacity-95"
        title="Click to enlarge"
      >
        <img
          src={url}
          alt={label}
          className="mx-auto max-h-72 w-full object-contain"
        />
      </button>
      {caption?.trim() ? (
        <p className="mt-2 text-sm text-text-navy">{caption.trim()}</p>
      ) : null}
      <p className="mt-2 text-xs text-text-muted">Click image to open a larger view</p>
    </div>
  );
}

function SelectionImageBlock({
  label,
  imageUrl,
  caption,
  emptyLabel = "-",
  onPreview,
  control,
  onDelete,
}: {
  label: string;
  imageUrl?: string | null;
  caption?: string | null;
  emptyLabel?: string;
  onPreview: (label: string, url: string) => void;
  control?: ReactNode;
  onDelete?: () => void;
}) {
  const name = caption?.trim() ?? "";
  if (!imageUrl && !name) {
    return (
      <div className="org-info-row flex items-start justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
          <div className="mt-1 text-sm text-text-navy">{emptyLabel}</div>
        </div>
        {control}
      </div>
    );
  }
  if (!imageUrl) {
    return <InfoRow label={label} value={name} control={control} onDeleteValue={onDelete} />;
  }
  return (
    <ImageBlock
      label={label}
      url={imageUrl}
      caption={name || undefined}
      onPreview={onPreview}
      control={control}
      onDelete={onDelete}
    />
  );
}

function TagSelectionsBlock({
  items,
  onPreview,
  control,
}: {
  items: TagSelectionItem[] | undefined;
  onPreview: (label: string, url: string) => void;
  control?: ReactNode;
}) {
  const withImages = (items ?? []).filter((item) => item.image_url);
  const namesOnly = (items ?? []).filter((item) => !item.image_url && item.name.trim());
  if (withImages.length === 0 && namesOnly.length === 0) {
    return (
      <div className="org-info-row flex items-start justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tags</div>
          <div className="mt-1 text-sm text-text-navy">-</div>
        </div>
        {control}
      </div>
    );
  }
  return (
    <div className="org-info-media border-b border-border px-5 py-4 last:border-b-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tags</div>
        {control}
      </div>
      {withImages.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {withImages.map((item) => (
            <div key={item.name} className="w-full max-w-md">
              <button
                type="button"
                onClick={() => onPreview(`Tag — ${item.name}`, item.image_url!)}
                className="block w-full overflow-hidden rounded-xl border border-border bg-content-bg transition hover:opacity-95"
                title="Click to enlarge"
              >
                <img
                  src={item.image_url!}
                  alt={item.name}
                  className="mx-auto max-h-48 w-full object-contain p-3"
                />
              </button>
              <p className="mt-2 text-sm text-text-navy">{item.name}</p>
            </div>
          ))}
        </div>
      ) : null}
      {namesOnly.map((item) => (
        <p key={item.name} className="mt-2 text-sm text-text-navy">
          {item.name}
        </p>
      ))}
      {withImages.length > 0 ? (
        <p className="mt-2 text-xs text-text-muted">Click image to open a larger view</p>
      ) : null}
    </div>
  );
}

function OrganizationSelectionBlocks({
  org,
  onPreview,
  modelControl,
  tagsControl,
  templateControl,
  onModelDelete,
  onTemplateDelete,
}: {
  org: OrganizationSelections;
  onPreview: (label: string, url: string) => void;
  modelControl?: ReactNode;
  tagsControl?: ReactNode;
  templateControl?: ReactNode;
  onModelDelete?: () => void;
  onTemplateDelete?: () => void;
}) {
  return (
    <>
      <SelectionImageBlock
        label="Model"
        imageUrl={org.model_image_url}
        caption={org.model}
        onPreview={onPreview}
        control={modelControl}
        onDelete={onModelDelete}
      />
      <TagSelectionsBlock items={org.tag_items} onPreview={onPreview} control={tagsControl} />
      <SelectionImageBlock
        label="Selected Template"
        imageUrl={org.template_image_url}
        caption={org.template_name}
        onPreview={onPreview}
        control={templateControl}
        onDelete={onTemplateDelete}
      />
    </>
  );
}

export function OrganizationInfoPage({ mode = "school" }: { mode?: "school" | "institute" | "organization" }) {
  const [searchParams] = useSearchParams();
  const isOrganization = mode === "organization";
  const isInstitute = mode === "institute";
  const orgId = searchParams.get(isOrganization ? "organizationId" : isInstitute ? "instituteId" : "schoolId") ?? "";
  const orgName = searchParams.get(isOrganization ? "organizationName" : isInstitute ? "instituteName" : "schoolName") ?? "";
  const kindPath = isOrganization ? "organizations" : isInstitute ? "institutes" : "schools";
  async function reloadInfo() {
    if (!orgId) return;
    try {
      const path = isOrganization ? `/admin/organizations/${orgId}/organization-info` : isInstitute
        ? `/admin/institutes/${orgId}/organization-info`
        : `/admin/schools/${orgId}/organization-info`;
      const { data } = await api.get<{ organization: SchoolOrganization | InstituteOrganization }>(path);
      if (isInstitute) setInstitute(data.organization as InstituteOrganization);
      else setSchool(data.organization as SchoolOrganization);
    } catch {
      /* ignore */
    }
  }
  async function deleteOrgImage(type: "logo" | "signature" | "organization") {
    if (!orgId) return;
    if (!window.confirm("Delete this image?")) return;
    try {
      await api.delete(`/admin/org-image/${kindPath}/${orgId}/${type}`);
      const col = type === "logo" ? "logo_url" : type === "signature" ? "signature_url" : "organization_photo_url";
      if (isInstitute) setInstitute((p) => (p ? { ...p, [col]: null } : p));
      else setSchool((p) => (p ? { ...p, [col]: null } : p));
    } catch {
      /* ignore */
    }
  }
  async function replaceOrgImage(type: "logo" | "signature" | "organization", file: File) {
    if (!orgId) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/admin/org-image/${kindPath}/${orgId}/${type}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      await reloadInfo();
    } catch {
      setError("Could not upload the image.");
    }
  }
  async function saveDetailField(field: string, value: string | null) {
    if (!orgId) return;
    try {
      await api.patch(`/admin/org-detail/${kindPath}/${orgId}`, { field, value });
      await reloadInfo();
    } catch {
      setError("Could not save this field.");
    }
  }

  const backHref = isOrganization ? `/extra-2/${encodeURIComponent(orgId)}` : isInstitute
    ? `/institute-members?instituteId=${encodeURIComponent(orgId)}${orgName ? `&instituteName=${encodeURIComponent(orgName)}` : ""}`
    : `/students?schoolId=${encodeURIComponent(orgId)}${orgName ? `&schoolName=${encodeURIComponent(orgName)}` : ""}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolOrganization | null>(null);
  const [institute, setInstitute] = useState<InstituteOrganization | null>(null);
  const [preview, setPreview] = useState<{ label: string; url: string } | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);

  const visibility =
    (isInstitute ? institute?.field_visibility : school?.field_visibility) ?? {};

  function detailSwitch(key: string) {
    return (
      <DetailSwitch
        on={visibility[key] !== false}
        disabled={detailSaving}
        onToggle={(on) => void toggleDetail(key, on)}
      />
    );
  }

  async function toggleDetail(key: string, on: boolean) {
    if (!orgId) return;
    const next = { ...visibility, [key]: on };
    const previousSchool = school;
    const previousInstitute = institute;
    if (isInstitute && institute) {
      setInstitute({ ...institute, field_visibility: next });
    } else if (school) {
      setSchool({ ...school, field_visibility: next });
    }
    setDetailSaving(true);
    setError(null);
    try {
      const path = isOrganization ? `/admin/organizations/${orgId}/details` : isInstitute
        ? `/admin/institutes/${orgId}/app-settings`
        : `/admin/schools/${orgId}/app-settings`;
      await api.patch(path, { field_visibility: next });
    } catch (err) {
      if (isInstitute) setInstitute(previousInstitute);
      else setSchool(previousSchool);
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Could not save this field.");
      } else setError("Could not save this field.");
    } finally {
      setDetailSaving(false);
    }
  }

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const path = isOrganization ? `/admin/organizations/${orgId}/organization-info` : isInstitute
          ? `/admin/institutes/${orgId}/organization-info`
          : `/admin/schools/${orgId}/organization-info`;
        const { data } = await api.get<{ organization: SchoolOrganization | InstituteOrganization }>(path);
        if (cancelled) return;
        if (isInstitute) {
          setInstitute(data.organization as InstituteOrganization);
        } else {
          setSchool(data.organization as SchoolOrganization);
        }
      } catch (err) {
        if (!cancelled) {
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Failed to load organization info.");
          } else setError("Failed to load organization info.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, isInstitute, isOrganization]);

  const previewImages = useMemo(() => {
    const items: { label: string; url: string }[] = [];
    const pushOrg = (org: OrganizationSelections) => {
      if (org.model_image_url) {
        items.push({ label: "Model", url: org.model_image_url });
      }
      for (const tag of org.tag_items ?? []) {
        if (tag.image_url) {
          items.push({ label: `Tag — ${tag.name}`, url: tag.image_url });
        }
      }
      if (org.template_image_url) {
        items.push({ label: "Selected Template", url: org.template_image_url });
      }
    };
    if (isInstitute && institute) {
      pushOrg(institute);
      if (institute.logo_url) items.push({ label: "Logo", url: institute.logo_url });
      if (institute.signature_url) items.push({ label: "Signature", url: institute.signature_url });
    } else if (school) {
      pushOrg(school);
      if (school.logo_url) items.push({ label: "Logo", url: school.logo_url });
      if (school.signature_url) items.push({ label: "Signature", url: school.signature_url });
      if (school.organization_photo_url) {
        items.push({ label: "Building / Organization Photo", url: school.organization_photo_url });
      }
    }
    return items;
  }, [isInstitute, institute, school]);

  const previewIndex = preview
    ? previewImages.findIndex((item) => item.url === preview.url)
    : -1;

  return (
    <div className="centered-page-shell org-info-page">
      <HeaderBack to={backHref}>
        ← Back
      </HeaderBack>

      {error && <div className="w-full alert-error">{error}</div>}

      {loading ? (
        <div className="mt-6 text-sm text-text-muted">Loading…</div>
      ) : !orgId ? (
        <div className="centered-page-card mt-6 px-6 py-10 text-center text-sm text-text-muted">
          Open this page from a {isInstitute ? "institute" : "school"} detail screen.
        </div>
      ) : (
        <div className="centered-page-card org-info mt-6 overflow-hidden">
          {isInstitute && institute ? (
            <>
              <InfoRow
                label="Institute Name"
                value={institute.name}
                control={
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-muted">Required Details</span>
                    {detailSwitch("required_details")}
                  </div>
                }
              />
              <InfoRow label="Year" value={institute.year} control={detailSwitch("detail_year")} onSaveValue={(v) => void saveDetailField("year", v)} onDeleteValue={() => void saveDetailField("year", null)} />
              <InfoRow label="Phone" secret="phone number" value={institute.phone} control={detailSwitch("detail_phone")} onSaveValue={(v) => void saveDetailField("phone", v)} onDeleteValue={() => void saveDetailField("phone", null)} />
              <InfoRow label="Secondary Phone" secret="phone number" value={institute.phone2} control={detailSwitch("detail_phone2")} onSaveValue={(v) => void saveDetailField("phone2", v)} onDeleteValue={() => void saveDetailField("phone2", null)} />
              <InfoRow label="Institute Code" value={institute.institute_code} control={detailSwitch("detail_code")} onSaveValue={(v) => void saveDetailField("code", v)} onDeleteValue={() => void saveDetailField("code", null)} />
              <InfoRow label="Address" value={institute.address} control={detailSwitch("detail_address")} onSaveValue={(v) => void saveDetailField("address", v)} onDeleteValue={() => void saveDetailField("address", null)} multiline />
              <InfoRow label="Instructions" value={institute.instructions} control={detailSwitch("detail_instructions")} onSaveValue={(v) => void saveDetailField("instructions", v)} onDeleteValue={() => void saveDetailField("instructions", null)} multiline />
              <OrganizationSelectionBlocks
                org={institute}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
                modelControl={detailSwitch("detail_model")}
                tagsControl={detailSwitch("detail_tags")}
                templateControl={detailSwitch("detail_template")}
                onModelDelete={() => void saveDetailField("model", null)}
                onTemplateDelete={() => void saveDetailField("template", null)}
              />
              <ImageBlock label="Logo" url={institute.logo_url} onPreview={(l, u) => setPreview({ label: l, url: u })} control={detailSwitch("detail_logo")} onDelete={() => void deleteOrgImage("logo")} onReplace={(f) => void replaceOrgImage("logo", f)} />
              <ImageBlock label="Signature" url={institute.signature_url} onPreview={(l, u) => setPreview({ label: l, url: u })} control={detailSwitch("detail_signature")} onDelete={() => void deleteOrgImage("signature")} onReplace={(f) => void replaceOrgImage("signature", f)} />
              <ImageBlock
                label="Building / Organization Photo"
                url={institute.organization_photo_url}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
                control={detailSwitch("detail_organization_photo")}
                onDelete={() => void deleteOrgImage("organization")}
                onReplace={(f) => void replaceOrgImage("organization", f)}
              />
            </>
          ) : null}
          {!isInstitute && school ? (
            <>
              <InfoRow
                label={isOrganization ? "Organization Name" : "School Name"}
                value={school.name}
                control={
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-muted">Required Details</span>
                    {detailSwitch("required_details")}
                  </div>
                }
              />
              <InfoRow label="Year" value={school.year} control={detailSwitch("detail_year")} onSaveValue={(v) => void saveDetailField("year", v)} onDeleteValue={() => void saveDetailField("year", null)} />
              <InfoRow label="Phone" secret="phone number" value={school.phone} control={detailSwitch("detail_phone")} onSaveValue={(v) => void saveDetailField("phone", v)} onDeleteValue={() => void saveDetailField("phone", null)} />
              <InfoRow label="Secondary Phone" secret="phone number" value={school.phone2} control={detailSwitch("detail_phone2")} onSaveValue={(v) => void saveDetailField("phone2", v)} onDeleteValue={() => void saveDetailField("phone2", null)} />
              <InfoRow label={isOrganization ? "Organization Code" : "School Code"} value={school.school_code} control={detailSwitch("detail_code")} onSaveValue={(v) => void saveDetailField("code", v)} onDeleteValue={() => void saveDetailField("code", null)} />
              <InfoRow label="Address" value={school.address} control={detailSwitch("detail_address")} onSaveValue={(v) => void saveDetailField("address", v)} onDeleteValue={() => void saveDetailField("address", null)} multiline />
              <InfoRow label="Instructions" value={school.instructions} control={detailSwitch("detail_instructions")} onSaveValue={(v) => void saveDetailField("instructions", v)} onDeleteValue={() => void saveDetailField("instructions", null)} multiline />
              <>
              <OrganizationSelectionBlocks
                org={school}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
                modelControl={detailSwitch("detail_model")}
                tagsControl={detailSwitch("detail_tags")}
                templateControl={detailSwitch("detail_template")}
                onModelDelete={() => void saveDetailField("model", null)}
                onTemplateDelete={() => void saveDetailField("template", null)}
              />
              <ImageBlock label="Logo" url={school.logo_url} onPreview={(l, u) => setPreview({ label: l, url: u })} control={detailSwitch("detail_logo")} onDelete={() => void deleteOrgImage("logo")} onReplace={(f) => void replaceOrgImage("logo", f)} />
              <ImageBlock label="Signature" url={school.signature_url} onPreview={(l, u) => setPreview({ label: l, url: u })} control={detailSwitch("detail_signature")} onDelete={() => void deleteOrgImage("signature")} onReplace={(f) => void replaceOrgImage("signature", f)} />
              <ImageBlock
                label="Building / Organization Photo"
                url={school.organization_photo_url}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
                control={detailSwitch("detail_organization_photo")}
                onDelete={() => void deleteOrgImage("organization")}
                onReplace={(f) => void replaceOrgImage("organization", f)}
              />
              </>
            </>
          ) : null}
          {!loading && !error && !school && !institute && (
            <div className="px-6 py-10 text-center text-sm text-text-muted">No information submitted yet.</div>
          )}
        </div>
      )}

      {orgId && (school || institute) ? (
        <OrgAppSettings
          orgId={orgId}
          institute={isInstitute}
          organization={isOrganization}
          initialAllowNumberEdit={
            (isInstitute ? institute?.allow_number_edit : school?.allow_number_edit) !== false
          }
          initialAllowRecordEdit={
            (isOrganization ? school?.field_visibility?.allow_record_edit : isInstitute ? institute?.allow_record_edit : school?.allow_record_edit) !== false
          }
          initialShowCaptured={
            (isOrganization ? school?.field_visibility?.show_captured_section : isInstitute ? institute?.show_captured_section : school?.show_captured_section) !==
            false
          }
        />
      ) : null}

      <ImagePreviewModal
        open={Boolean(preview)}
        title={preview?.label ?? ""}
        imageUrl={preview?.url}
        onClose={() => setPreview(null)}
        onPrevious={
          previewIndex > 0
            ? () => setPreview(previewImages[previewIndex - 1]!)
            : undefined
        }
        onNext={
          previewIndex >= 0 && previewIndex < previewImages.length - 1
            ? () => setPreview(previewImages[previewIndex + 1]!)
            : undefined
        }
        hasPrevious={previewIndex > 0}
        hasNext={previewIndex >= 0 && previewIndex < previewImages.length - 1}
      />
    </div>
  );
}
