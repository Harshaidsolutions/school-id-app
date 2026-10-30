/**
 * One-time setup for offline desktop licensing.
 *   npx tsx scripts/genDesktopLicenseKeys.ts
 * 1. Copy the DESKTOP_LICENSE_PRIVATE_KEY=... line into backend/.env on EC2 (keep it secret).
 * 2. Copy the printed PUBLIC key into desktop-generator/src/main/licensePublicKey.ts before
 *    building the Windows installer.
 * Never regenerate after customers have activated — their licences are signed with this key.
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
console.log("\n=== Put this ONE line in backend/.env (secret) ===\n");
console.log(`DESKTOP_LICENSE_PRIVATE_KEY=${Buffer.from(priv).toString("base64")}`);
console.log("\n=== Put this in desktop-generator/src/main/licensePublicKey.ts ===\n");
console.log(pub);
