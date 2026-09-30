import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import api from "../api/client";
import {
  DEFAULT_FORM_FIELDS,
  sortFormFields,
  type FormFieldConfig,
} from "../constants/formFields";

export function useFormConfig(options?: { refreshOnFocus?: boolean }) {
  const refreshOnFocus = options?.refreshOnFocus !== false;
  const [fields, setFields] = useState<FormFieldConfig[]>(
    DEFAULT_FORM_FIELDS.filter((f) => f.enabled)
  );
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>(
    {}
  );
  const [allowNumberEdit, setAllowNumberEdit] = useState(true);
  const [allowRecordEdit, setAllowRecordEdit] = useState(true);
  const [showCapturedSection, setShowCapturedSection] = useState(true);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const formResult = await api.get<{ fields: FormFieldConfig[] }>(
        "/teacher/form-config"
      );
      const data = formResult.data;
      if (data.fields?.length) {
        setFields(sortFormFields(data.fields));
      } else {
        setFields([]);
      }
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
      setFields(DEFAULT_FORM_FIELDS.filter((f) => f.enabled));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return;
      void reload(false);
      const timer = setInterval(() => {
        void reload(true);
      }, 2500);
      return () => clearInterval(timer);
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
