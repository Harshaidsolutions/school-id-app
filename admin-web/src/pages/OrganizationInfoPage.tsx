import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { ImagePreviewModal } from "../components/ImagePreviewModal";
import { OrgAppSettings } from "../components/OrgAppSettings";
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
  show_captured_section?: boolean | null;
};

type InstituteOrganization = OrganizationSelections & {
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
  show_captured_section?: boolean | null;
};

function InfoRow({
  label,
  value,
  showWhenEmpty,
  emptyLabel = "-",
}: {
  label: string;
  value: string | null | undefined;
  showWhenEmpty?: boolean;
  emptyLabel?: string;
}) {
  const display = value?.trim()
    ? value.trim()
    : showWhenEmpty
      ? emptyLabel
      : "-";
  return (
    <div className="border-b border-border px-5 py-3 last:border-b-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-text-navy">{display}</div>
    </div>
  );
}

function ImageBlock({
  label,
  url,
  caption,
  onPreview,
}: {
  label: string;
  url: string | null | undefined;
  caption?: string | null;
  onPreview: (label: string, url: string) => void;
}) {
  if (!url?.trim()) {
    return (
      <div className="border-b border-border px-5 py-3 last:border-b-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
        <div className="mt-1 text-sm text-text-navy">-</div>
      </div>
    );
  }
  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <button
        type="button"
        onClick={() => onPreview(label, url)}
        className="block w-full max-w-md overflow-hidden rounded-xl border border-border bg-content-bg transition hover:opacity-95"
        title="Click to enlarge"
      >
        <img
          src={url}
          alt={label}
          className="mx-auto max-h-72 w-full object-contain p-3"
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
}: {
  label: string;
  imageUrl?: string | null;
  caption?: string | null;
  emptyLabel?: string;
  onPreview: (label: string, url: string) => void;
}) {
  const name = caption?.trim() ?? "";
  if (!imageUrl && !name) {
    return (
      <div className="border-b border-border px-5 py-3 last:border-b-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
        <div className="mt-1 text-sm text-text-navy">{emptyLabel}</div>
      </div>
    );
  }
  if (!imageUrl) {
    return <InfoRow label={label} value={name} />;
  }
  return (
    <ImageBlock
      label={label}
      url={imageUrl}
      caption={name || undefined}
      onPreview={onPreview}
    />
  );
}

function TagSelectionsBlock({
  items,
  onPreview,
}: {
  items: TagSelectionItem[] | undefined;
  onPreview: (label: string, url: string) => void;
}) {
  const withImages = (items ?? []).filter((item) => item.image_url);
  const namesOnly = (items ?? []).filter((item) => !item.image_url && item.name.trim());
  if (withImages.length === 0 && namesOnly.length === 0) {
    return (
      <div className="border-b border-border px-5 py-3 last:border-b-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tags</div>
        <div className="mt-1 text-sm text-text-navy">-</div>
      </div>
    );
  }
  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Tags</div>
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
}: {
  org: OrganizationSelections;
  onPreview: (label: string, url: string) => void;
}) {
  return (
    <>
      <SelectionImageBlock
        label="Model"
        imageUrl={org.model_image_url}
        caption={org.model}
        onPreview={onPreview}
      />
      <TagSelectionsBlock items={org.tag_items} onPreview={onPreview} />
      <SelectionImageBlock
        label="Selected Template"
        imageUrl={org.template_image_url}
        caption={org.template_name}
        onPreview={onPreview}
      />
    </>
  );
}

export function OrganizationInfoPage({ mode = "school" }: { mode?: "school" | "institute" }) {
  const [searchParams] = useSearchParams();
  const isInstitute = mode === "institute";
  const orgId = searchParams.get(isInstitute ? "instituteId" : "schoolId") ?? "";
  const orgName = searchParams.get(isInstitute ? "instituteName" : "schoolName") ?? "";

  const backHref = isInstitute
    ? `/institute-members?instituteId=${encodeURIComponent(orgId)}${orgName ? `&instituteName=${encodeURIComponent(orgName)}` : ""}`
    : `/students?schoolId=${encodeURIComponent(orgId)}${orgName ? `&schoolName=${encodeURIComponent(orgName)}` : ""}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolOrganization | null>(null);
  const [institute, setInstitute] = useState<InstituteOrganization | null>(null);
  const [preview, setPreview] = useState<{ label: string; url: string } | null>(null);

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
        const path = isInstitute
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
  }, [orgId, isInstitute]);

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
    <div className="centered-page-shell">
      <Link to={backHref} className="mb-4 self-start text-sm font-medium text-button-blue hover:underline">
        ← Back
      </Link>

      {error && <div className="w-full alert-error">{error}</div>}

      {loading ? (
        <div className="mt-6 text-sm text-text-muted">Loading…</div>
      ) : !orgId ? (
        <div className="centered-page-card mt-6 px-6 py-10 text-center text-sm text-text-muted">
          Open this page from a {isInstitute ? "institute" : "school"} detail screen.
        </div>
      ) : (
        <div className="centered-page-card mt-6 overflow-hidden">
          {isInstitute && institute ? (
            <>
              <InfoRow label="Institute Name" value={institute.name} />
              <InfoRow label="Year" value={institute.year} />
              <InfoRow label="Phone" value={institute.phone} />
              <InfoRow label="Institute Code" value={institute.institute_code} />
              <InfoRow label="Address" value={institute.address} />
              <InfoRow label="Instructions" value={institute.instructions} />
              <OrganizationSelectionBlocks
                org={institute}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
              />
              <ImageBlock label="Logo" url={institute.logo_url} onPreview={(l, u) => setPreview({ label: l, url: u })} />
              <ImageBlock label="Signature" url={institute.signature_url} onPreview={(l, u) => setPreview({ label: l, url: u })} />
              <ImageBlock
                label="Building / Organization Photo"
                url={institute.organization_photo_url}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
              />
            </>
          ) : null}
          {!isInstitute && school ? (
            <>
              <InfoRow label="School Name" value={school.name} />
              <InfoRow label="Year" value={school.year} />
              <InfoRow label="Phone" value={school.phone} />
              <InfoRow label="Secondary Phone" value={school.phone2} />
              <InfoRow label="School Code" value={school.school_code} />
              <InfoRow label="Address" value={school.address} />
              <InfoRow label="Instructions" value={school.instructions} />
              <OrganizationSelectionBlocks
                org={school}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
              />
              <ImageBlock label="Logo" url={school.logo_url} onPreview={(l, u) => setPreview({ label: l, url: u })} />
              <ImageBlock label="Signature" url={school.signature_url} onPreview={(l, u) => setPreview({ label: l, url: u })} />
              <ImageBlock
                label="Building / Organization Photo"
                url={school.organization_photo_url}
                onPreview={(l, u) => setPreview({ label: l, url: u })}
              />
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
          initialVisibility={
            (isInstitute ? institute?.field_visibility : school?.field_visibility) ?? {}
          }
          initialAllowNumberEdit={
            (isInstitute ? institute?.allow_number_edit : school?.allow_number_edit) !== false
          }
          initialShowCaptured={
            (isInstitute ? institute?.show_captured_section : school?.show_captured_section) !==
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
