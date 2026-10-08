import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

export function HeaderBack({ to, children, onClick, disabled }: { to?: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  const [target,setTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>setTarget(document.getElementById("page-header-back")),[]);
  const control = to ? <Link to={to} className="header-back">{children}</Link> : <button type="button" disabled={disabled} onClick={onClick} className="header-back">{children}</button>;
  return target ? createPortal(control,target) : null;
}
