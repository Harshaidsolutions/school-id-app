import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { buildReferMessage } from "../constants/support";
import { openWhatsApp, openWhatsAppShare } from "../utils/whatsappBusiness";

export const APP_BRAND_NAME = "My School ID Card";

export type CustomerBrand = {
  adminName: string;
  phone: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  youtube: string | null;
  aboutUs: string | null;
  email: string | null;
};

function emptyBrand(): CustomerBrand {
  return {
    adminName: APP_BRAND_NAME,
    phone: null,
    whatsapp: null,
    facebook: null,
    instagram: null,
    youtube: null,
    aboutUs: null,
    email: null,
  };
}

export function whatsAppDigits(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function useCustomerBrand() {
  const { isAuthenticated } = useAuth();
  const [brand, setBrand] = useState<CustomerBrand>(emptyBrand());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setBrand(emptyBrand());
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ branding: Partial<CustomerBrand> }>(
        "/teacher/branding"
      );
      const next = data.branding ?? {};
      setBrand({
        adminName: next.adminName?.trim() || APP_BRAND_NAME,
        phone: next.phone?.trim() || null,
        whatsapp: next.whatsapp?.trim() || null,
        facebook: next.facebook?.trim() || null,
        instagram: next.instagram?.trim() || null,
        youtube: next.youtube?.trim() || null,
        aboutUs: next.aboutUs?.trim() || null,
        email: next.email?.trim() || null,
      });
    } catch {
      setError("Could not load your organization details.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { brand, loading, error, reload };
}

export function missingContact() {
  Alert.alert("Not available", "Your admin has not added this contact yet.");
}

export async function openBrandWhatsApp(brand: CustomerBrand, message = "") {
  const phone = whatsAppDigits(brand.whatsapp);
  if (!phone) {
    missingContact();
    return;
  }
  await openWhatsApp(message, phone);
}

export async function openBrandRefer(brand: CustomerBrand, orgName: string) {
  const phone = whatsAppDigits(brand.whatsapp);
  const message = buildReferMessage(orgName);
  if (phone) {
    await openWhatsApp(message, phone);
    return;
  }
  await openWhatsAppShare(message);
}
