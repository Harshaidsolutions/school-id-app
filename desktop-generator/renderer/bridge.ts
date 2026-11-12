export type LicenseStatus = {
  licensed: boolean;
  customer?: string;
  licenseKey?: string;
  expiresAt?: string | null;
  machineLabel: string;
  reason?: string | null;
};

type FileFilter = { name: string; extensions: string[] };

export type DesktopBridge = {
  licenseStatus(): Promise<LicenseStatus>;
  activate(key: string): Promise<{ ok: boolean; message?: string; status?: LicenseStatus }>;
  resetLicense(): Promise<LicenseStatus>;
  saveFile(defaultName: string, data: ArrayBuffer, filters?: FileFilter[]): Promise<{ saved: boolean; filePath?: string }>;
  openFile(filters?: FileFilter[]): Promise<{ name: string; data: ArrayBuffer } | null>;
  reveal(filePath: string): Promise<void>;
  /** Pick an output folder on this computer (null when cancelled). */
  pickFolder(): Promise<string | null>;
  /** Write one file inside a picked folder; returns the full path. */
  writeInFolder(root: string, rel: string, data: ArrayBuffer): Promise<string>;
  /** Full path of a picked file on this computer ("" when unknown). */
  pathForFile?(file: File): string;
  /** Called when the licence is disabled / expires while the app is open. Returns an unsubscribe. */
  onLicenseChanged?(cb: (s: LicenseStatus) => void): () => void;
  info(): Promise<{ version: string }>;
};

declare global {
  interface Window { desktop?: DesktopBridge }
}

export const desktop = (): DesktopBridge => {
  if (!window.desktop) throw new Error("Desktop features are unavailable.");
  return window.desktop;
};
