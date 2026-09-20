import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StoredLocalImage } from "./orgDetailsLocalImage";

/** Persists Required Details selections across navigation, logout, and app restart. */
export type OrgDetailsDraft = {
  signatureUri: string | null;
  logoUri: string | null;
  orgPhotoUri: string | null;
  pendingSignature?: StoredLocalImage | null;
  pendingLogo?: StoredLocalImage | null;
  pendingOrgPhoto?: StoredLocalImage | null;
  templateId: string | null;
  templatePreviewUrlState: string | null;
  model: string;
  tags: string;
  modelPreviewUrl: string | null;
  tagsPreviewUrl: string | null;
  phone: string;
  phone2: string;
  schoolCode: string;
  establishYear: string;
  address: string;
  instructions: string;
};

const memoryDrafts = new Map<string, OrgDetailsDraft>();
const memorySubmitted = new Map<string, OrgDetailsDraft>();

function draftKey(userId: string): string {
  return `teacher_org_draft_v2:${userId}`;
}

function submittedKey(userId: string): string {
  return `teacher_org_submitted_v2:${userId}`;
}

export function getOrgDetailsDraft(userId: string): OrgDetailsDraft | undefined {
  if (!userId) return undefined;
  return memoryDrafts.get(userId);
}

export async function loadOrgDetailsDraft(
  userId: string
): Promise<OrgDetailsDraft | undefined> {
  if (!userId) return undefined;
  const cached = memoryDrafts.get(userId);
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OrgDetailsDraft;
    memoryDrafts.set(userId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function setOrgDetailsDraft(userId: string, draft: OrgDetailsDraft): void {
  if (!userId) return;
  memoryDrafts.set(userId, draft);
  void AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft)).catch(() => {});
}

const EMPTY_DRAFT: OrgDetailsDraft = {
  signatureUri: null,
  logoUri: null,
  orgPhotoUri: null,
  pendingSignature: null,
  pendingLogo: null,
  pendingOrgPhoto: null,
  templateId: null,
  templatePreviewUrlState: null,
  model: "",
  tags: "",
  modelPreviewUrl: null,
  tagsPreviewUrl: null,
  phone: "",
  phone2: "",
  schoolCode: "",
  establishYear: "",
  address: "",
  instructions: "",
};

/** Merge partial selection/upload fields into persisted draft (await before navigate back). */
export async function mergeOrgDetailsDraft(
  userId: string,
  patch: Partial<OrgDetailsDraft>
): Promise<OrgDetailsDraft> {
  if (!userId) return { ...EMPTY_DRAFT, ...patch };
  const existing = (await loadOrgDetailsDraft(userId)) ?? EMPTY_DRAFT;
  const merged: OrgDetailsDraft = { ...existing, ...patch };
  memoryDrafts.set(userId, merged);
  try {
    await AsyncStorage.setItem(draftKey(userId), JSON.stringify(merged));
  } catch {
    /* ignore storage errors */
  }
  return merged;
}

export function clearOrgDetailsDraft(userId: string): void {
  if (!userId) return;
  memoryDrafts.delete(userId);
  void AsyncStorage.removeItem(draftKey(userId)).catch(() => {});
}

/** Last successfully submitted Required Details — survives logout/restart. */
export async function loadOrgDetailsSubmitted(
  userId: string
): Promise<OrgDetailsDraft | undefined> {
  if (!userId) return undefined;
  const cached = memorySubmitted.get(userId);
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(submittedKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OrgDetailsDraft;
    memorySubmitted.set(userId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export async function saveOrgDetailsSubmitted(
  userId: string,
  snapshot: OrgDetailsDraft
): Promise<void> {
  if (!userId) return;
  memorySubmitted.set(userId, snapshot);
  memoryDrafts.set(userId, snapshot);
  try {
    await AsyncStorage.multiSet([
      [submittedKey(userId), JSON.stringify(snapshot)],
      [draftKey(userId), JSON.stringify(snapshot)],
    ]);
  } catch {
    /* ignore storage errors */
  }
}
