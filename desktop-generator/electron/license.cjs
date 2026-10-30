const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { machineId, machineLabel } = require("./machineId.cjs");

const PRODUCT = "msidc-desktop-generator";
const ACTIVATE_URL = process.env.MSIDC_LICENSE_URL || "https://myschoolidcard.in/api/public/desktop-license/activate";

/**
 * Licence storage & verification — everything here works offline.
 *  - license.dat holds the server-signed licence, encrypted with Windows DPAPI (safeStorage),
 *    so the file is unreadable if copied to another computer or Windows user.
 *  - Every start: verify Ed25519 signature with the embedded public key, the product,
 *    that the licence's machineId equals THIS computer, the expiry date, and that the
 *    clock has not been wound back (lastSeen).
 */
function createLicenseManager({ app, safeStorage, netFetch, publicKeyPem }) {
  const dir = app.getPath("userData");
  const file = path.join(dir, "license.dat");
  const seenFile = path.join(dir, "state.dat");

  const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
  const seal = (text) => (canEncrypt() ? Buffer.concat([Buffer.from("E1"), safeStorage.encryptString(text)]) : Buffer.concat([Buffer.from("P1"), Buffer.from(text, "utf8")]));
  const open = (buf) => {
    const tag = buf.subarray(0, 2).toString();
    if (tag === "E1") return safeStorage.decryptString(buf.subarray(2));
    if (tag === "P1") return buf.subarray(2).toString("utf8");
    throw new Error("bad file");
  };

  function verifyLicense(lic) {
    if (!lic || typeof lic.payload !== "string" || typeof lic.signature !== "string") return { ok: false, reason: "missing" };
    let key;
    try { key = crypto.createPublicKey(publicKeyPem); } catch { return { ok: false, reason: "This build has no licence key installed. Contact Harsha ID Solutions." }; }
    const good = crypto.verify(null, Buffer.from(lic.payload, "utf8"), key, Buffer.from(lic.signature, "base64"));
    if (!good) return { ok: false, reason: "The licence file is not valid." };
    let p;
    try { p = JSON.parse(Buffer.from(lic.payload, "base64").toString("utf8")); } catch { return { ok: false, reason: "The licence file is damaged." }; }
    if (p.product !== PRODUCT) return { ok: false, reason: "This licence is for a different product." };
    if (p.machineId !== machineId()) return { ok: false, reason: "This licence belongs to another computer. Ask Harsha ID Solutions for a licence for this computer." };
    const now = Date.now();
    if (p.expiresAt && new Date(p.expiresAt).getTime() < now) return { ok: false, reason: `This licence expired on ${new Date(p.expiresAt).toLocaleDateString("en-IN")}.`, payload: p };
    const last = readLastSeen();
    if (last && now < last - 36 * 3600 * 1000) return { ok: false, reason: "The computer's date and time look wrong. Correct the clock and restart the app." };
    return { ok: true, payload: p };
  }

  function readLastSeen() {
    try { return Number(open(fs.readFileSync(seenFile))) || 0; } catch { return 0; }
  }
  function touch() {
    try { fs.writeFileSync(seenFile, seal(String(Math.max(Date.now(), readLastSeen())))); } catch { /* ignore */ }
  }

  function load() {
    try { return JSON.parse(open(fs.readFileSync(file))); } catch { return null; }
  }

  function status() {
    const lic = load();
    if (!lic) return { licensed: false, machineLabel: machineLabel(), reason: null };
    const v = verifyLicense(lic);
    if (v.ok) touch();
    return v.ok
      ? { licensed: true, customer: v.payload.customer, licenseKey: v.payload.licenseKey, expiresAt: v.payload.expiresAt, machineLabel: machineLabel() }
      : { licensed: false, machineLabel: machineLabel(), reason: v.reason };
  }

  async function activate(rawKey) {
    const licenseKey = String(rawKey || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
    let res;
    try {
      res = await netFetch(ACTIVATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey, machineId: machineId(), machineLabel: machineLabel(), appVersion: app.getVersion() }),
      });
    } catch {
      return { ok: false, message: "Could not reach the licence server. Connect to the internet for this one-time activation and try again." };
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.license) return { ok: false, message: body.message || `Activation failed (${res.status}).` };
    const v = verifyLicense(body.license);
    if (!v.ok) return { ok: false, message: v.reason };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, seal(JSON.stringify(body.license)));
    touch();
    return { ok: true, status: status() };
  }

  function deactivateLocal() {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
    return status();
  }

  return { status, activate, deactivateLocal, verifyLicense };
}

module.exports = { createLicenseManager, PRODUCT };
