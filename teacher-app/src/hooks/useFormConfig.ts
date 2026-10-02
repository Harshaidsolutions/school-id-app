import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../api/client";
import { sortFormFields, type FormFieldConfig } from "../constants/formFields";

type FormConfigResponse = {
  fields: FormFieldConfig[];
  updated_at?: string | null;
};

const listeners = new Set<(fields: FormFieldConfig[]) => void>();
let confirmedVersion: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let pollerCount = 0;

async function pullFormConfigIfChanged(): Promise<void> {
  if (AppState.currentState !== "active") return;
  try {
    const formResult = await api.get<FormConfigResponse>("/teacher/form-config");
    const version = formResult.data.updated_at ?? "";
    if (confirmedVersion !== null && version === confirmedVersion) return;
    confirmedVersion = version;
    const next = sortFormFields(formResult.data.fields ?? []);
    listeners.forEach((listener) => listener(next));
  } catch {
    /* Keep the last confirmed fields until the next successful response. */
  }
}

function retainFormConfigPoller(): () => void {
  pollerCount += 1;
  if (pollerCount === 1) {
    pollTimer = setInterval(() => {
      void pullFormConfigIfChanged();
    }, 3000);
    appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void pullFormConfigIfChanged();
    });
  }
  return () => {
    pollerCount -= 1;
    if (pollerCount > 0) return;
    pollerCount = 0;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}

export function useFormConfig(options?: { refreshOnFocus?: boolean }) {
  const refreshOnFocus = options?.refreshOnFocus !== false;
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>(
    {}
  );
  const [allowNumberEdit, setAllowNumberEdit] = useState(true);
  const [allowRecordEdit, setAllowRecordEdit] = useState(true);
  const [showCapturedSection, setShowCapturedSection] = useState(true);
  const [loading, setLoading] = useState(true);

  const requestSeq = useRef(0);
  const reload = useCallback(async (silent = false) => {
    const seq = ++requestSeq.current;
    if (!silent) setLoading(true);
    try {
      const formResult = await api.get<FormConfigResponse>("/teacher/form-config");
      if (seq !== requestSeq.current) return;
      confirmedVersion = formResult.data.updated_at ?? "";
      const data = formResult.data;
      setFields(sortFormFields(data.fields ?? []));
      try {
        const orgResult = await api.get<{
          school?: {
            field_visibility?: Record<string, boolean> | null;
            allow_number_edit?: boolean | null;
            allow_record_edit?: boolean | null;
            show_captured_section?: boolean | null;
          };
        }>("/teacher/organization");
        const school = orgResult.data.school;
        setFieldVisibility(school?.field_visibility ?? {});
        setAllowNumberEdit(school?.allow_number_edit !== false);
        setAllowRecordEdit(school?.allow_record_edit !== false);
        setShowCapturedSection(school?.show_captured_section !== false);
      } catch {
        setFieldVisibility({});
        setAllowNumberEdit(true);
        setAllowRecordEdit(true);
        setShowCapturedSection(true);
      }
    } catch {
      if (seq !== requestSeq.current) return;
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const apply = (next: FormFieldConfig[]) => setFields(next);
    listeners.add(apply);
    const release = retainFormConfigPoller();
    return () => {
      listeners.delete(apply);
      release();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return;
      void reload(false);
    }, [refreshOnFocus, reload])
  );

  return {
    fields,
    fieldVisibility,
    allowNumberEdit,
    allowRecordEdit,
    showCapturedSection,
    loading,
    reload,
  };
}
