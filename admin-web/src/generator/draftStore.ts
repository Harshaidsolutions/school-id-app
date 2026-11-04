/**
 * Unsaved generator work, kept in the browser (IndexedDB, so template images fit) per
 * school / institute. Reopening the generator — after a refresh, closing the tab or the
 * admin app — continues exactly where the admin left off.
 */
import type { Layout } from "./types";

export type DraftTemplate = { blob: Blob; name: string; libraryId?: string } | null;
export type Draft = {
  layout: Layout;
  sideMode: "single" | "double";
  templates: { front: DraftTemplate; back: DraftTemplate };
  designId: string | null;
  savedSnapshot: string;
  print: { sheetKey: string; landscape: boolean; gap: number; margin: number };
  className: string;
  savedAt: number;
};

const DB = "idg-drafts";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode / storage blocked: work just isn't kept
  }
}

export const loadDraft = (orgId: string) => run<Draft>("readonly", (s) => s.get(orgId) as IDBRequest<Draft>);
export const saveDraft = (orgId: string, draft: Draft) => run("readwrite", (s) => s.put(draft, orgId));
export const clearDraft = (orgId: string) => run("readwrite", (s) => s.delete(orgId));
