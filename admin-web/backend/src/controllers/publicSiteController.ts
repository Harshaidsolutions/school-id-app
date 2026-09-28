import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { sendEmail } from "../utils/email";

/** Same address as teacher-app/src/constants/support.ts SUPPORT_EMAIL. */
const PUBLIC_ENQUIRY_TO = "harshaidsolutions@gmail.com";

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      `SELECT name, image_url
       FROM catalog_items
       WHERE kind = 'brochure'
         AND NULLIF(trim(image_url), '') IS NOT NULL
         AND NULLIF(trim(name), '') IS NOT NULL
       ORDER BY created_at DESC`
    );

    const organizations = [...schools.rows, ...institutes.rows]
      .map((row) => ({
        name: row.name.trim(),
        logoUrl: row.logo_url?.trim() || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

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
    if (phoneDigits.length < 7 || phoneDigits.length > 15 || phone.length > 20) {
      throw new AppError("Enter a valid phone number.", 400);
    }
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("Enter a valid email address.", 400);
    }
    if (message.length < 1 || message.length > 2000) {
      throw new AppError("Enter a message.", 400);
    }

    const text = [
      "New message from the Harsha ID Solutions website",
      "",
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      "",
      message,
    ].join("\n");

    const mail = await sendEmail({
      to: PUBLIC_ENQUIRY_TO,
      subject: "Website enquiry",
      text,
      html: `<p>New message from the Harsha ID Solutions website</p>
        <p><strong>Name:</strong> ${escapeHtml(name)}<br>
        <strong>Phone:</strong> ${escapeHtml(phone)}<br>
        <strong>Email:</strong> ${escapeHtml(email)}</p>
        <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
    });

    if (!mail.delivered) {
      throw new AppError("Message could not be sent right now. Please call or use WhatsApp.", 503);
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
}
