import { Linking, Platform } from "react-native";
import { SUPPORT_PHONE_E164 } from "../constants/support";

const WHATSAPP_ANDROID = "com.whatsapp";

/**
 * Open the teacher's normal WhatsApp app to message the company's WhatsApp Business number.
 */
export async function openWhatsApp(message: string, phoneE164?: string): Promise<void> {
  const trimmed = message.trim();
  const text = trimmed ? encodeURIComponent(trimmed) : "";
  const phone = (phoneE164 || SUPPORT_PHONE_E164).replace(/\D/g, "");
  if (!phone) {
    throw new Error("WhatsApp number is not configured.");
  }
  const waMeUrl = text
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/${phone}`;

  if (Platform.OS === "android") {
    const intentUrl = text
      ? `intent://send/?phone=${phone}&text=${text}#Intent;scheme=whatsapp;package=${WHATSAPP_ANDROID};end`
      : `intent://send/?phone=${phone}#Intent;scheme=whatsapp;package=${WHATSAPP_ANDROID};end`;
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch {
      /* fallback below */
    }
  }

  if (Platform.OS === "ios") {
    const iosUrl = text
      ? `whatsapp://send?phone=${phone}&text=${text}`
      : `whatsapp://send?phone=${phone}`;
    try {
      const canOpen = await Linking.canOpenURL(iosUrl);
      if (canOpen) {
        await Linking.openURL(iosUrl);
        return;
      }
    } catch {
      /* fallback below */
    }
  }

  try {
    await Linking.openURL(waMeUrl);
    return;
  } catch {
    /* handled below */
  }

  throw new Error(
    "WhatsApp is not installed. Please install WhatsApp to contact support."
  );
}

/** Open WhatsApp share sheet so the user picks a contact (no pre-filled admin number). */
export async function openWhatsAppShare(message: string): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("Share message is empty.");
  }
  const text = encodeURIComponent(trimmed);

  if (Platform.OS === "android") {
    const intentUrl = `intent://send?text=${text}#Intent;scheme=whatsapp;package=${WHATSAPP_ANDROID};end`;
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch {
      /* fallback below */
    }
  }

  const iosUrl = `whatsapp://send?text=${text}`;
  try {
    const canOpen = await Linking.canOpenURL(iosUrl);
    if (canOpen) {
      await Linking.openURL(iosUrl);
      return;
    }
  } catch {
    /* fallback below */
  }

  const waMeUrl = `https://wa.me/?text=${text}`;
  await Linking.openURL(waMeUrl);
}

/** @deprecated Use openWhatsApp */
export const openWhatsAppBusiness = openWhatsApp;
