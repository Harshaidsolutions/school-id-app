import { Linking, Platform } from "react-native";
import { SUPPORT_PHONE_E164 } from "../constants/support";

const WHATSAPP_ANDROID = "com.whatsapp";

/**
 * Open the teacher's normal WhatsApp app to message the company's WhatsApp Business number.
 */
export async function openWhatsApp(message: string): Promise<void> {
  const text = encodeURIComponent(message);
  const phone = SUPPORT_PHONE_E164;
  const waMeUrl = `https://wa.me/${phone}?text=${text}`;

  if (Platform.OS === "android") {
    const intentUrl = `intent://send/?phone=${phone}&text=${text}#Intent;scheme=whatsapp;package=${WHATSAPP_ANDROID};end`;
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch {
      /* fallback below */
    }
  }

  if (Platform.OS === "ios") {
    const iosUrl = `whatsapp://send?phone=${phone}&text=${text}`;
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

/** @deprecated Use openWhatsApp */
export const openWhatsAppBusiness = openWhatsApp;
