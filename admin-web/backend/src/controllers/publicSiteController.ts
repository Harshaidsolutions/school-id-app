import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { SUPER_ADMIN_EMAIL } from "../utils/adminScope";
import { AppError } from "../middleware/errorHandler";

const enquiryHits = new Map<string, number[]>();

function allowEnquiry(ip: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (enquiryHits.get(ip) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= 5) {
    enquiryHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  enquiryHits.set(ip, recent);
  return true;
}

/**
 * Public-safe names and brochure files only.
 * Does not return phones, addresses, logins, or passwords.
 */
export async function getPublicShowcase(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schools = await pool.query<{ name: string; logo_url: string | null }>(
      `SELECT name, logo_url
       FROM schools
       WHERE COALESCE(is_active, true) = true
         AND NULLIF(trim(name), '') IS NOT NULL
       ORDER BY name ASC`
    );
    const institutes = await pool.query<{ name: string; logo_url: string | null }>(
      `SELECT name, logo_url
       FROM institutes
       WHERE COALESCE(is_active, true) = true
         AND NULLIF(trim(name), '') IS NOT NULL
       ORDER BY name ASC`
    );
    const brochures = await pool.query<{ name: string; image_url: string }>(
      `SELECT c.name, c.image_url
       FROM catalog_items c
       WHERE c.kind = 'brochure'
         AND NULLIF(trim(c.image_url), '') IS NOT NULL
         AND NULLIF(trim(c.name), '') IS NOT NULL
         AND c.owner_admin_id = COALESCE(
           (
             SELECT u.id FROM users u
             WHERE u.role = 'admin'
               AND lower(trim(u.email)) = lower(trim($1))
             LIMIT 1
           ),
           (
             SELECT u.id FROM users u
             WHERE u.role = 'admin'
             ORDER BY u.created_at ASC NULLS LAST
             LIMIT 1
           )
         )
       ORDER BY c.created_at DESC`,
      [SUPER_ADMIN_EMAIL]
    );

    const organizations = [...schools.rows, ...institutes.rows]
      .map((row) => ({
        name: row.name.trim(),
        logoUrl: row.logo_url?.trim() || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.set("Cache-Control", "no-store");
    res.status(200).json({
      status: "ok",
      schools: organizations,
      brochures: brochures.rows.map((row) => ({
        name: row.name.trim(),
        fileUrl: row.image_url,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function submitPublicEnquiry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ip = req.ip || "unknown";
    if (!allowEnquiry(ip)) {
      throw new AppError("Please wait a few minutes before sending another message.", 429);
    }

    const name = String(req.body?.name ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const message = String(req.body?.message ?? "").trim();
    const phoneDigits = phone.replace(/\D/g, "");

    if (name.length < 2 || name.length > 80) {
      throw new AppError("Enter your name.", 400);
    }
    if (phone.length > 20 || phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new AppError("Enter a valid phone number.", 400);
    }
    if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new AppError("Enter a valid email address.", 400);
    }
    if (message.length > 2000) {
      throw new AppError("Enter a shorter message.", 400);
    }

    // The Teacher App only opens WhatsApp on the device. This backend has no
    // WhatsApp Business Cloud API client, token, or phone-number id, so it
    // cannot deliver this enquiry to the admin number.
    throw new AppError(
      "Message could not be sent right now. Please call or use the phone number on Contact Us.",
      503
    );
  } catch (error) {
    next(error);
  }
}
