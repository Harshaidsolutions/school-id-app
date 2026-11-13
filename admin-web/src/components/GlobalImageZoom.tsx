import { useEffect, useState } from "react";
import { MediaLightbox } from "./MediaLightbox";

/** Places where a click on a picture must keep its own meaning (editors, logos, menus…). */
const SKIP = [
  "button", "a", "label", "summary", "[role=button]", "[data-no-zoom]",
  ".media-viewer", ".idg", ".crop-tool-shell", ".app-sidebar", "header", "nav",
].join(",");

/**
 * Any picture on the website can be opened full screen and zoomed (buttons, wheel, pinch, drag):
 * a click on an image that is not already a button or link opens it in the shared viewer.
 */
export function GlobalImageZoom() {
  const [open, setOpen] = useState<{ src: string; title: string } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const img = e.target as HTMLElement | null;
      if (!img || img.tagName !== "IMG") return;
      const el = img as HTMLImageElement;
      if (el.closest(SKIP)) return;
      if (!el.closest("main, .msidc-embed, .modal-overlay, [role=dialog]")) return; // page content only
      if ((el.naturalWidth || el.width) < 48) return; // icons, avatars in lists
      const src = el.currentSrc || el.src;
      if (!src) return;
      e.preventDefault();
      setOpen({ src, title: el.alt || "Image" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!open) return null;
  return <MediaLightbox title={open.title} pages={[{ src: open.src }]} openUrl={open.src} onClose={() => setOpen(null)} />;
}
