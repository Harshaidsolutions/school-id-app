export function StatusPill({
  active,
  onClick,
}: {
  active: boolean;
  onClick?: () => void;
}) {
  const className = `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
    active ? "bg-green-soft text-parrot-green" : "bg-danger-soft text-danger"
  } ${onClick ? "cursor-pointer hover:opacity-80" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-label={active ? "Set inactive" : "Set active"}>
        {active ? "Active" : "Inactive"}
      </button>
    );
  }

  return <span className={className}>{active ? "Active" : "Inactive"}</span>;
}
