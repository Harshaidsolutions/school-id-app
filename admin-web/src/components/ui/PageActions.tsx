import type { ReactNode } from "react";

/** Top row inside a page: search on left, actions on right */
export function PageActions({
  search,
  actions,
}: {
  search?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">{search}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
