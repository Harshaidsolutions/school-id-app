export const SUPPORT_PHONE = "7799881779";
export const SUPPORT_PHONE_E164 = "917799881779";

export const SOCIAL_YOUTUBE =
  "https://youtube.com/@harshaidsolutions?si=IQa77O7zsyIgh6AP";
export const SOCIAL_INSTAGRAM =
  "https://www.instagram.com/harsha_ids_2016?stkn=eTZoZXo2Y2hkN2kw";
export const SOCIAL_FACEBOOK =
  "https://www.facebook.com/share/19YJGrEicU/";

export const SUPPORT_EMAIL = "harshaidsolutions@gmail.com";
export const SUPPORT_WEBSITE = "https://harshaidsolutions.in";
export const PLAY_STORE_PACKAGE = "com.schoolid.teacher";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;
export const PLAY_STORE_MARKET_URL = `market://details?id=${PLAY_STORE_PACKAGE}`;

/** Fixed catalog link for Refer Us (WhatsApp share sheet). */
export const REFER_WHATSAPP_CATALOG_LINK =
  "https://wa.me/message/HGMJJK7FOLRBB1";

/** Opens WhatsApp chat without prefilled body text. */
export function buildHelpSupportMessage(schoolName?: string): string {
  const name = schoolName?.trim() ?? "";
  if (!name) return "I need support @My School ID Card";
  return `I need support @My School ID Card\n#${name}`;
}

export function buildReferMessage(schoolName: string): string {
  const name = schoolName.trim() || "Your School";
  return `I would like to refer a new school from My School ID Card.\n#${name}`;
}

/** Message the current user sends to someone else. The catalog link is the text, not the chat target. */
export function buildReferShareMessage(_catalogLink?: string): string {
  return `I want to refer this My School ID card app\n\n${REFER_WHATSAPP_CATALOG_LINK}`;
}
