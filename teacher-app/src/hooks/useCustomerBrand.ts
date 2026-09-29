import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import axios from "axios";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { buildReferMessage } from "../constants/support";
import { openWhatsApp } from "../utils/whatsappBusiness";

export const APP_BRAND_NAME = "My School ID Card";

export type CustomerBrand = {
  /** platform = Super Admin organization, keep the existing Harsha experience. */
  source: "platform" | "child";
  adminName: string;
  phone: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  youtube: string | null;
  email: string | null;
};

function emptyBrand(): CustomerBrand {
  return {
    source: "platform",
    adminName: APP_BRAND_NAME,
    phone: null,
    whatsapp: null,
    facebook: null,
    instagram: null,
    youtube: null,
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
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setBrand(emptyBrand());
      setError(null);
      setReady(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ branding: Partial<CustomerBrand> }>(
        "/teacher/branding"
      );
      const next = data.branding ?? {};
      if (next.source !== "child") {
        setBrand(emptyBrand());
      } else {
        setBrand({
          source: "child",
          adminName: next.adminName?.trim() || APP_BRAND_NAME,
          phone: next.phone?.trim() || null,
          whatsapp: next.whatsapp?.trim() || null,
          facebook: next.facebook?.trim() || null,
          instagram: next.instagram?.trim() || null,
          youtube: next.youtube?.trim() || null,
          email: next.email?.trim() || null,
        });
      }
      setReady(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setBrand(emptyBrand());
        setReady(true);
        return;
      }
      setError("Could not load your organization details.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { brand, ready, loading, error, reload };
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
  if (!phone) {
    missingContact();
    return;
  }
  await openWhatsApp(buildReferMessage(orgName), phone);
}
