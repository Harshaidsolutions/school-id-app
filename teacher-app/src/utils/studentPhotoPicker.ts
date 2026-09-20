import * as ImagePicker from "expo-image-picker";

/** Camera/gallery at full quality — no crop, no extra compression. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 1,
  allowsEditing: false,
  exif: false,
};

export async function pickStudentPhotoFromCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Camera permission is required to take the student photo.");
  }

  const result = await ImagePicker.launchCameraAsync({
    ...PICKER_OPTIONS,
    cameraType: ImagePicker.CameraType.back,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function pickStudentPhotoFromGallery(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(
      "Photo library permission is required to pick a student photo."
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    ...PICKER_OPTIONS,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export type PhotoSource = "camera" | "gallery";

export async function pickStudentPhoto(source: PhotoSource): Promise<string | null> {
  return source === "camera"
    ? pickStudentPhotoFromCamera()
    : pickStudentPhotoFromGallery();
}
