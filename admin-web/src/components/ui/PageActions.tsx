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
    <div className="page-actions">
      <div className="page-actions-search">{search}</div>
      {actions ? <div className="page-actions-buttons">{actions}</div> : null}
    </div>
  );
}
