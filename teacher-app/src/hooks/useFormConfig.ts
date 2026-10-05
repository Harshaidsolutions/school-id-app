import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { sortFormFields, type FormFieldConfig } from "../constants/formFields";

type Settings = {
  field_visibility?: Record<string, boolean> | null;
  allow_number_edit?: boolean | null;
  allow_record_edit?: boolean | null;
  show_captured_section?: boolean | null;
};
type Snapshot = { fields: FormFieldConfig[]; settings: Settings };
const listeners = new Set<(snapshot: Snapshot) => void>();
let session: string | null = null;
let cached: Snapshot | null = null;
let pending: Promise<void> | null = null;

async function pull(token: string): Promise<void> {
  if (session !== token) {
    session = token;
    cached = null;
    pending = null;
  }
  if (pending) return pending;
  const task = (async () => {
    // Settings have their own update lifecycle; the form timestamp alone is insufficient.
    const [form, organization] = await Promise.all([
      api.get<{ fields: FormFieldConfig[] }>("/teacher/form-config"),
      api.get<{ school?: Settings }>("/teacher/organization"),
    ]);
    if (session !== token) return;
    cached = { fields: sortFormFields(form.data.fields ?? []), settings: organization.data.school ?? {} };
    listeners.forEach((listener) => listener(cached!));
  })();
  pending = task;
  try { await task; } finally { if (pending === task) pending = null; }
}

export function useFormConfig(options?: { refreshOnFocus?: boolean }) {
  const { token } = useAuth();
  const refreshOnFocus = options?.refreshOnFocus !== false;
  const [snapshot, setSnapshot] = useState<Snapshot>({ fields: [], settings: { allow_number_edit: false, allow_record_edit: false } });
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try { await pull(token); } catch {
      // Retain confirmed permissions when offline; never enable edits after a failed fetch.
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    setSnapshot({ fields: [], settings: { allow_number_edit: false, allow_record_edit: false } });
    if (!token) return;
    const apply = (next: Snapshot) => { setSnapshot(next); setLoading(false); };
    listeners.add(apply);
    if (session === token && cached) apply(cached);
    void reload(true);
    return () => { listeners.delete(apply); };
  }, [token, reload]);

  useFocusEffect(useCallback(() => {
    if (!refreshOnFocus || !token) return;
    void reload(false);
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void reload(true);
    }, 5000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload(true);
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refreshOnFocus, token, reload]));

  return {
    fields: snapshot.fields,
    fieldVisibility: snapshot.settings.field_visibility ?? {},
    allowNumberEdit: snapshot.settings.allow_number_edit !== false,
    allowRecordEdit: snapshot.settings.allow_record_edit !== false,
    showCapturedSection: snapshot.settings.show_captured_section !== false,
    loading,
    reload,
  };
}
