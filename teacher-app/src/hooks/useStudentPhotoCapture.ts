import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { TeacherStudent } from "../types";
import type { PhotoSource } from "../utils/studentPhotoPicker";
import { pickStudentPhoto } from "../utils/studentPhotoPicker";

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Options = {
  fromModal?: boolean;
  onBeforeNavigate?: () => void;
};

export function useStudentPhotoCapture(navigation: Nav, options: Options = {}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetStudent, setSheetStudent] = useState<TeacherStudent | null>(null);
  const [busy, setBusy] = useState(false);

  const openPhotoSheet = useCallback((student: TeacherStudent) => {
    setSheetStudent(student);
    setSheetVisible(true);
  }, []);

  const closePhotoSheet = useCallback(() => {
    if (busy) return;
    setSheetVisible(false);
    setSheetStudent(null);
  }, [busy]);

  const handleSourceSelect = useCallback(
    async (source: PhotoSource) => {
      if (!sheetStudent) return;
      setBusy(true);
      try {
        const student = sheetStudent;
        setSheetVisible(false);
        setSheetStudent(null);
        options.onBeforeNavigate?.();

        const photoUri = await pickStudentPhoto(source);
        if (!photoUri) return;

        navigation.navigate("Preview", {
          student,
          photoUri,
          photoOnly: true,
          fromModal: options.fromModal,
          photoSource: source,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        Alert.alert("Photo error", detail);
      } finally {
        setBusy(false);
      }
    },
    [navigation, options, sheetStudent]
  );

  return {
    sheetVisible,
    sheetStudent,
    sheetBusy: busy,
    openPhotoSheet,
    closePhotoSheet,
    handleSourceSelect,
  };
}
