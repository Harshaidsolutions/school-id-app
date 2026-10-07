import { useMemo } from "react";
import type { Student } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";
import { RecordMediaViewer } from "./RecordMediaViewer";

export function StudentPhotoModal({ student, students, onNavigate, onClose, mode = "photo" }: {
  student: Student; students: Student[]; onNavigate: (student: Student) => void;
  onClose: () => void; mode?: "photo" | "signature";
}) {
  const items = useMemo(() => students.filter(row => mode === "signature" ? row.signature_url : row.photo_url).map(row => ({
    id: row.id,
    title: `${row.student_name || "Record"} · ${mode === "signature" ? "Signature" : "Photo"}`,
    detail: [row.photo_id, row.class_section, row.roll_no ? `Roll ${row.roll_no}` : "", mode === "photo" && row.photo_captured_at ? `Captured: ${new Date(row.photo_captured_at).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}` : ""].filter(Boolean).join(" · "),
    load: async () => ({url: (mode === "signature" ? await authenticatedStudentSignatureUrl(row.id) : await authenticatedStudentPhotoUrl(row.id, {version:row.updated_at})) || ""}),
  })), [students, mode]);
  return <RecordMediaViewer items={items} activeId={student.id} onClose={onClose} onNavigate={id => { const row = students.find(row => row.id === id); if (row) onNavigate(row); }} />;
}
