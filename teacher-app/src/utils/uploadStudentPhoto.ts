import api from "../api/client";
import type { TeacherStudent } from "../types";

/** Upload a captured student/member photo (shared by Preview + ID Cards pending flow). */
export async function uploadStudentPhoto(
  studentId: string,
  photoUri: string
): Promise<TeacherStudent> {
  const formData = new FormData();
  formData.append("photo", {
    uri: photoUri,
    name: `${studentId}.jpg`,
    type: "image/jpeg",
  } as unknown as Blob);
  const { data } = await api.post<{ student: TeacherStudent }>(
    `/teacher/students/${studentId}/photo`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      transformRequest: (body) => body,
    }
  );
  return data.student;
}
