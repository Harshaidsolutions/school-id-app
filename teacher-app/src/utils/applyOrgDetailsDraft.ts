import type { OrgDetailsDraft } from "./orgDetailsDraft";
import type { StoredLocalImage } from "./orgDetailsLocalImage";

export type OrgDetailsDraftSetters = {
  setSignatureUri: (v: string | null) => void;
  setLogoUri: (v: string | null) => void;
  setOrgPhotoUri: (v: string | null) => void;
  setPendingSignature: (v: StoredLocalImage | null) => void;
  setPendingLogo: (v: StoredLocalImage | null) => void;
  setPendingOrgPhoto: (v: StoredLocalImage | null) => void;
  setTemplateId: (v: string | null) => void;
  setTemplatePreviewUrlState: (v: string | null) => void;
  setModel: (v: string) => void;
  setTags: (v: string) => void;
  setModelPreviewUrl: (v: string | null) => void;
  setTagsPreviewUrl: (v: string | null) => void;
  setPhone: (v: string) => void;
  setPhone2: (v: string) => void;
  setSchoolCode: (v: string) => void;
  setEstablishYear: (v: string) => void;
  setAddress: (v: string) => void;
  setInstructions: (v: string) => void;
};

/** Apply catalog/template/model/tag fields from a saved draft into screen state setters. */
export function applyOrgDetailsDraftSelections(
  draft: OrgDetailsDraft,
  setters: Pick<
    OrgDetailsDraftSetters,
    | "setTemplateId"
    | "setTemplatePreviewUrlState"
    | "setModel"
    | "setTags"
    | "setModelPreviewUrl"
    | "setTagsPreviewUrl"
  >
): void {
  if (draft.templateId) setters.setTemplateId(draft.templateId);
  if (draft.templatePreviewUrlState) {
    setters.setTemplatePreviewUrlState(draft.templatePreviewUrlState);
  }
  if (draft.model) setters.setModel(draft.model);
  if (draft.tags) setters.setTags(draft.tags);
  if (draft.modelPreviewUrl) setters.setModelPreviewUrl(draft.modelPreviewUrl);
  if (draft.tagsPreviewUrl) setters.setTagsPreviewUrl(draft.tagsPreviewUrl);
}

/** Restore full Required Details draft/submitted snapshot including uploads. */
export function applyFullOrgDetailsDraft(
  draft: OrgDetailsDraft,
  setters: OrgDetailsDraftSetters
): void {
  if (draft.signatureUri != null) setters.setSignatureUri(draft.signatureUri);
  if (draft.logoUri != null) setters.setLogoUri(draft.logoUri);
  if (draft.orgPhotoUri != null) setters.setOrgPhotoUri(draft.orgPhotoUri);
  if (draft.pendingSignature) setters.setPendingSignature(draft.pendingSignature);
  if (draft.pendingLogo) setters.setPendingLogo(draft.pendingLogo);
  if (draft.pendingOrgPhoto) setters.setPendingOrgPhoto(draft.pendingOrgPhoto);
  if (draft.phone) setters.setPhone(draft.phone);
  if (draft.phone2) setters.setPhone2(draft.phone2);
  if (draft.schoolCode) setters.setSchoolCode(draft.schoolCode);
  if (draft.establishYear) setters.setEstablishYear(draft.establishYear);
  if (draft.address) setters.setAddress(draft.address);
  if (draft.instructions) setters.setInstructions(draft.instructions);
  applyOrgDetailsDraftSelections(draft, setters);
}

/** Authoritative organization row from GET /teacher/organization (overwrites local form state). */
export function applyOrgSchoolFromServer(
  row: {
    phone?: string | null;
    phone2?: string | null;
    school_code?: string | null;
    establish_year?: string | null;
    year?: string | null;
    address?: string | null;
    instructions?: string | null;
    signature_url?: string | null;
    logo_url?: string | null;
    organization_photo_url?: string | null;
    template_id?: string | null;
    model?: string | null;
    tags?: string | null;
  },
  imgs: Record<string, string>,
  catalog: Array<{ name: string; image_url?: string | null }>,
  setters: OrgDetailsDraftSetters,
  toImageUri: (url: string | null | undefined) => string | null
): void {
  setters.setPhone(row.phone?.trim() ?? "");
  setters.setPhone2(row.phone2?.trim() ?? "");
  setters.setSchoolCode(row.school_code?.trim() ?? "");
  setters.setEstablishYear((row.establish_year ?? row.year ?? "").trim());
  setters.setAddress(row.address?.trim() ?? "");
  setters.setInstructions(row.instructions?.trim() ?? "");
  setters.setPendingSignature(null);
  setters.setPendingLogo(null);
  setters.setPendingOrgPhoto(null);
  setters.setSignatureUri(
    row.signature_url ? toImageUri(row.signature_url) : null
  );
  setters.setLogoUri(row.logo_url ? toImageUri(row.logo_url) : null);
  setters.setOrgPhotoUri(
    row.organization_photo_url ? toImageUri(row.organization_photo_url) : null
  );

  const templateId = row.template_id ?? null;
  if (templateId && imgs[templateId]) {
    setters.setTemplateId(templateId);
    setters.setTemplatePreviewUrlState(imgs[templateId]);
  } else {
    setters.setTemplateId(null);
    setters.setTemplatePreviewUrlState(null);
  }

  const modelName = row.model?.trim() ?? "";
  setters.setModel(modelName);
  if (modelName) {
    const url = catalog.find((m) => m.name === modelName)?.image_url ?? null;
    setters.setModelPreviewUrl(url);
  } else {
    setters.setModelPreviewUrl(null);
  }

  const tagsCsv = row.tags?.trim() ?? "";
  setters.setTags(tagsCsv);
  const firstTag = tagsCsv.split(",")[0]?.trim() ?? "";
  if (firstTag) {
    const url = catalog.find((m) => m.name === firstTag)?.image_url ?? null;
    setters.setTagsPreviewUrl(url);
  } else {
    setters.setTagsPreviewUrl(null);
  }
}
