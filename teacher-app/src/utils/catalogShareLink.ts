import api from "../api/client";
import { resolveMediaUrl } from "./mediaUrl";
import { SUPPORT_WEBSITE } from "../constants/support";

/** Latest admin-uploaded brochure/catalog file URL for referral sharing. */
export async function fetchCatalogShareLink(): Promise<string> {
  try {
    const { data } = await api.get<{
      brochure: { fileUrl: string | null } | null;
    }>("/teacher/brochure");
    const raw = data.brochure?.fileUrl?.trim();
    if (raw) {
      const url = resolveMediaUrl(raw);
      if (url) return url;
    }
  } catch {
    /* fallback below */
  }
  return SUPPORT_WEBSITE;
}
