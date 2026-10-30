const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const os = require("node:os");

/**
 * Stable fingerprint of THIS Windows installation.
 * Uses the Windows MachineGuid (unique per Windows install, unchanged by renaming the PC,
 * adding RAM or changing networks). Hashed with a product salt so the raw GUID is never sent.
 */
function rawMachineGuid() {
  if (process.platform === "win32") {
    try {
      const out = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true, timeout: 8000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{20,})/);
      if (m) return m[1].toLowerCase();
    } catch { /* fall through */ }
  }
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 8000 });
      const m = out.match(/"IOPlatformUUID" = "([^"]+)"/);
      if (m) return m[1].toLowerCase();
    } catch { /* fall through */ }
  }
  try {
    const fs = require("node:fs");
    for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  } catch { /* ignore */ }
  // Last resort (non-Windows dev machines): hostname + CPU model.
  return `${os.hostname()}|${os.cpus()[0]?.model ?? ""}`;
}

let cached = null;
function machineId() {
  if (!cached) cached = crypto.createHash("sha256").update(`msidc-desktop|${rawMachineGuid()}`).digest("hex");
  return cached;
}

function machineLabel() {
  return `${os.hostname()} (${process.platform === "win32" ? "Windows" : process.platform} ${os.release()})`.slice(0, 120);
}

module.exports = { machineId, machineLabel };
