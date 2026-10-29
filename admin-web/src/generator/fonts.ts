/**
 * Fonts for card text: system fonts, any Google Font (curated list + type any name),
 * and the client's own .ttf/.otf/.woff files (kept in this browser with IndexedDB).
 */
export const SYSTEM_FONTS = ["Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New"];

export const GOOGLE_FONTS = [
  // Clean sans for names and details
  "Poppins", "Roboto", "Open Sans", "Lato", "Montserrat", "Inter", "Nunito", "Raleway", "Source Sans 3", "Work Sans",
  "Plus Jakarta Sans", "Rubik", "Mukta", "Hind", "Barlow", "Oswald", "Roboto Condensed", "Archivo Narrow", "PT Sans", "Ubuntu",
  // Headings / display
  "Bebas Neue", "Anton", "Playfair Display", "Merriweather", "Lora", "Cinzel", "Righteous", "Alfa Slab One", "Bree Serif", "Teko",
  // Script (signature-like captions)
  "Great Vibes", "Dancing Script", "Pacifico", "Satisfy",
  // Telugu & Indian scripts
  "Noto Sans Telugu", "Noto Serif Telugu", "Ramabhadra", "Mandali", "NTR", "Suranna", "Gidugu", "Tenali Ramakrishna",
  "Ramaraja", "Sree Krushnadevaraya", "Mallanna", "Peddana", "Gurajada", "Dhurjati", "Timmana", "Ponnala", "Suravaram",
  "Lakki Reddy", "Hind Guntur", "Anek Telugu", "Noto Sans Devanagari", "Noto Sans Kannada", "Noto Sans Tamil",
];

const loaded = new Set<string>();
const custom = new Set<string>();

export function isCustomFont(family: string): boolean {
  return custom.has(family);
}

export async function loadGoogleFont(family: string): Promise<boolean> {
  const name = family.trim();
  if (!name || SYSTEM_FONTS.includes(name) || custom.has(name)) return true;
  if (!loaded.has(name)) {
    loaded.add(name);
    // Separate requests: a family that lacks bold/italic must not block the regular weight.
    const base = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}`;
    await Promise.all([`${base}&display=swap`, ...[500, 600, 700, 800].map((w) => `${base}:wght@${w}&display=swap`), `${base}:ital@1&display=swap`].map((href) => new Promise<void>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => { link.remove(); resolve(); };
      document.head.appendChild(link);
      setTimeout(resolve, 6000);
    })));
  }
  try {
    await Promise.all([
      document.fonts.load(`400 24px "${name}"`),
      document.fonts.load(`700 24px "${name}"`),
    ]);
  } catch {
    return false;
  }
  return document.fonts.check(`400 24px "${name}"`);
}

// ---- Custom fonts persisted in IndexedDB ----
const DB = "idgen-fonts";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("fonts");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function register(family: string, data: ArrayBuffer): Promise<void> {
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
  custom.add(family);
}

export async function addCustomFont(file: File): Promise<string> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error("Use a .ttf, .otf, .woff or .woff2 font file");
  const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[_-]+/g, " ").trim();
  const data = await file.arrayBuffer();
  await register(family, data);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("fonts", "readwrite");
      tx.objectStore("fonts").put(data, family);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* private mode: font still works for this session */
  }
  return family;
}

export async function restoreCustomFonts(): Promise<string[]> {
  try {
    const db = await openDb();
    const entries = await new Promise<[string, ArrayBuffer][]>((resolve, reject) => {
      const out: [string, ArrayBuffer][] = [];
      const req = db.transaction("fonts").objectStore("fonts").openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { out.push([String(cur.key), cur.value as ArrayBuffer]); cur.continue(); }
        else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
    for (const [family, data] of entries) {
      if (!custom.has(family)) await register(family, data).catch(() => undefined);
    }
    return entries.map(([f]) => f);
  } catch {
    return [];
  }
}

export async function ensureFonts(families: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const f of new Set(families)) {
    if (SYSTEM_FONTS.includes(f) || custom.has(f)) continue;
    const ok = await loadGoogleFont(f);
    if (!ok) missing.push(f);
  }
  return missing;
}
