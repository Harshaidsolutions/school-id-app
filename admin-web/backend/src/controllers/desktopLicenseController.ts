import { createPrivateKey, createPublicKey, randomBytes, sign, type KeyObject } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { consumeAttempt } from "../middleware/attemptLimit";
import { requireSuperAdmin } from "../utils/adminScope";

/**
 * Offline desktop ID Card Generator licensing.
 *
 * - Super admin creates a licence key here (admin website → Desktop Licences).
 * - On first launch the desktop app sends {key, machineId} ONCE (internet needed only then).
 * - The server binds the key to that machine and returns a licence signed with the
 *   Ed25519 private key (env DESKTOP_LICENSE_PRIVATE_KEY). The desktop app holds only
 *   the public key, verifies the signature offline and checks the machine id every start.
 * - A copied installer or licence file fails on any other computer (different machine id),
 *   and the same key cannot be activated on a second computer unless super admin resets it.
 */

const PRODUCT = "msidc-desktop-generator";
let cachedKey: KeyObject | null = null;

function privateKey(): KeyObject {
  if (cachedKey) return cachedKey;
  const raw = (process.env.DESKTOP_LICENSE_PRIVATE_KEY ?? "").trim();
  if (!raw) throw new AppError("Desktop licensing is not configured on the server (DESKTOP_LICENSE_PRIVATE_KEY).", 503);
  const pem = raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  cachedKey = createPrivateKey(pem);
  return cachedKey;
}

export function desktopLicensePublicKeyPem(): string {
  return createPublicKey(privateKey()).export({ type: "spki", format: "pem" }).toString();
}

function newKey(): string {
  // 20 chars from an unambiguous alphabet → MSIDC-XXXXX-XXXXX-XXXXX-XXXXX
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `MSIDC-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}`;
}

const normKey = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

type Row = {
  id: string; license_key: string; customer_name: string; phone: string; notes: string;
  machine_id: string | null; machine_label: string | null; activated_at: string | null;
  last_seen_version: string | null; status: string; expires_at: string | null; created_at: string;
};

function publicRow(r: Row) {
  return {
    id: r.id, licenseKey: r.license_key, customerName: r.customer_name, phone: r.phone, notes: r.notes,
    machineBound: Boolean(r.machine_id), machineLabel: r.machine_label, activatedAt: r.activated_at,
    appVersion: r.last_seen_version, status: r.status, expiresAt: r.expires_at, createdAt: r.created_at,
  };
}

/* ───────────── Super admin management ───────────── */

export async function listDesktopLicenses(req: Request, res: Response, next: NextFunction) {
  try {
    await requireSuperAdmin(req);
    const { rows } = await pool.query<Row>("SELECT * FROM desktop_licenses ORDER BY created_at DESC LIMIT 1000");
    res.json({ status: "ok", licenses: rows.map(publicRow) });
  } catch (e) { next(e); }
}

export async function createDesktopLicense(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await requireSuperAdmin(req);
    privateKey(); // fail early if the server is not configured
    const customerName = text(req.body?.customerName, 160);
    if (!customerName) throw new AppError("Customer name is required", 400);
    const phone = text(req.body?.phone, 30);
    const notes = text(req.body?.notes, 1000);
    const expiresAt = req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new AppError("Invalid expiry date", 400);
    let row: Row | undefined;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      const result = await pool.query<Row>(
        `INSERT INTO desktop_licenses (license_key, customer_name, phone, notes, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (license_key) DO NOTHING RETURNING *`,
        [newKey(), customerName, phone, notes, expiresAt, scope.adminUserId],
      );
      row = result.rows[0];
    }
    if (!row) throw new AppError("Could not create a licence key. Try again.", 500);
    res.status(201).json({ status: "ok", license: publicRow(row) });
  } catch (e) { next(e); }
}

export async function updateDesktopLicenseStatus(req: Request, res: Response, next: NextFunction) {
  try {
    await requireSuperAdmin(req);
    const action = String(req.params.action);
    const sql =
      action === "revoke" ? "UPDATE desktop_licenses SET status='revoked', updated_at=NOW() WHERE id=$1 RETURNING *"
      : action === "restore" ? "UPDATE desktop_licenses SET status='active', updated_at=NOW() WHERE id=$1 RETURNING *"
      : action === "reset-machine" ? "UPDATE desktop_licenses SET machine_id=NULL, machine_label=NULL, activated_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *"
      : null;
    if (!sql) throw new AppError("Unknown action", 400);
    const { rows } = await pool.query<Row>(sql, [req.params.id]);
    if (!rows[0]) throw new AppError("Licence not found", 404);
    res.json({ status: "ok", license: publicRow(rows[0]) });
  } catch (e) { next(e); }
}

export async function deleteDesktopLicense(req: Request, res: Response, next: NextFunction) {
  try {
    await requireSuperAdmin(req);
    const { rowCount } = await pool.query("DELETE FROM desktop_licenses WHERE id=$1", [req.params.id]);
    if (!rowCount) throw new AppError("Licence not found", 404);
    res.json({ status: "ok" });
  } catch (e) { next(e); }
}

/* ───────────── Public activation (called once by the desktop app) ───────────── */

export async function activateDesktopLicense(req: Request, res: Response, next: NextFunction) {
  try {
    const key = normKey(req.body?.licenseKey);
    const machineId = String(req.body?.machineId ?? "").trim();
    const machineLabel = text(req.body?.machineLabel, 120);
    const appVersion = text(req.body?.appVersion, 30);
    consumeAttempt(`desktop-activate:${req.ip}`, 30);
    if (!/^MSIDC(-[A-Z0-9]{5}){4}$/.test(key)) throw new AppError("Enter a valid licence key (MSIDC-XXXXX-XXXXX-XXXXX-XXXXX).", 400);
    if (!/^[a-f0-9]{64}$/.test(machineId)) throw new AppError("Invalid machine id", 400);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Row>("SELECT * FROM desktop_licenses WHERE license_key=$1 FOR UPDATE", [key]);
      const row = rows[0];
      if (!row) throw new AppError("This licence key was not found. Check the key or contact Harsha ID Solutions.", 404);
      if (row.status !== "active") throw new AppError("This licence has been disabled. Contact Harsha ID Solutions.", 403);
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw new AppError("This licence has expired. Contact Harsha ID Solutions.", 403);
      if (row.machine_id && row.machine_id !== machineId) {
        throw new AppError("This licence key is already activated on another computer. Contact Harsha ID Solutions to move it.", 409);
      }
      const updated = await client.query<Row>(
        `UPDATE desktop_licenses SET machine_id=$2, machine_label=COALESCE(NULLIF($3,''), machine_label),
           activated_at=COALESCE(activated_at, NOW()), last_seen_version=$4, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [row.id, machineId, machineLabel, appVersion],
      );
      await client.query("COMMIT");
      const r = updated.rows[0];
      const payload = {
        v: 1,
        product: PRODUCT,
        licenseId: r.id,
        licenseKey: r.license_key,
        customer: r.customer_name,
        machineId,
        issuedAt: new Date().toISOString(),
        expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
      const signature = sign(null, Buffer.from(payloadB64, "utf8"), privateKey()).toString("base64");
      res.json({ status: "ok", license: { payload: payloadB64, signature } });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
}
