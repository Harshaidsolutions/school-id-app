import { useEffect, useState } from "react";

/** Logged-in admin's uploaded profile photo, with initials when no photo is set or it fails to load. */
export function AdminAvatar({
  photoUrl,
  name,
  size = "sm",
}: {
  photoUrl?: string | null;
  name: string;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A";
  const showPhoto = Boolean(photoUrl) && !failed;
  return (
    <span className={`admin-avatar admin-avatar-${size}`} aria-hidden={size === "sm" ? true : undefined}>
      {showPhoto ? (
        <img src={photoUrl ?? undefined} alt={size === "lg" ? `${name} profile photo` : ""} onError={() => setFailed(true)} />
      ) : (
        <span className="admin-avatar-initials">{initials}</span>
      )}
    </span>
  );
}
