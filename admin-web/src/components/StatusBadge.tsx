import type { Student } from "../types";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  captured: "bg-green-soft text-royal-green border-parrot-green/50",
  printed: "bg-green-soft text-royal-green border-parrot-green/50",
  completed: "bg-green-soft text-royal-green border-parrot-green/50",
  active: "bg-green-soft text-royal-green border-parrot-green/50",
  inactive: "bg-gray-soft text-text-muted border-border",
  failed: "bg-danger-soft text-danger border-danger-border",
};

export function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "pending").toLowerCase();
  const styles =
    STATUS_STYLES[value] ?? "bg-gray-soft text-text-muted border-border";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${styles}`}
    >
      {value}
    </span>
  );
}

export function PhotoThumb({ student }: { student: Student }) {
  if (!student.photo_url) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-soft text-[10px] text-text-subtle">
        —
      </div>
    );
  }

  return (
    <img
      src={student.photo_url}
      alt={student.student_name ?? "Student"}
      className="h-10 w-10 rounded-xl object-cover"
    />
  );
}
