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
