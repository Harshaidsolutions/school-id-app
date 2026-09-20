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
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ fields: FormFieldConfig[] }>(
        "/teacher/form-config"
      );
      if (data.fields?.length) {
        setFields(sortFormFields(data.fields));
      } else {
        setFields([]);
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
      void reload();
    }, [refreshOnFocus, reload])
  );

  return { fields, loading, reload };
}
