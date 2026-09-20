import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { sendEmail } from "./email";

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_LENGTH = 6;
const SALT_ROUNDS = 10;

export function generateOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

export async function requestAdminActionOtp(params: {
  adminUserId: string;
  adminEmail: string;
  actionType: string;
  resourceId: string;
  emailSubject: string;
  emailIntro: string;
  logPrefix: string;
}): Promise<{ devOtp?: string; emailDelivery: string; message: string }> {
  const {
    adminUserId,
    adminEmail,
    actionType,
    resourceId,
    emailSubject,
    emailIntro,
    logPrefix,
  } = params;

  await pool.query(
    `UPDATE admin_action_otps
     SET consumed_at = NOW()
     WHERE admin_user_id = $1 AND action_type = $2 AND resource_id = $3 AND consumed_at IS NULL`,
    [adminUserId, actionType, resourceId]
  );

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `INSERT INTO admin_action_otps
       (admin_user_id, action_type, resource_id, email, otp_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminUserId, actionType, resourceId, adminEmail, otpHash, expiresAt]
  );

  const mailText = `${emailIntro}\n\nYour verification code is: ${otp}\n\nThis code expires in 15 minutes.`;
  const mailHtml = `<p>${emailIntro}</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>This code expires in 15 minutes.</p>`;

  const mail = await sendEmail({
    to: adminEmail,
    subject: emailSubject,
    text: mailText,
    html: mailHtml,
  });

  let emailDelivery = "sent";
  let devOtp: string | undefined;
  let message = "If your admin email can receive mail, a verification code has been sent.";

  if (!mail.delivered) {
    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) {
      console.log(`${logPrefix} SMTP not configured. OTP for ${adminEmail}: ${otp}`);
      devOtp = otp;
      emailDelivery = "logged";
      message = "OTP generated (dev mode — shown below).";
    } else {
      console.error(`${logPrefix} SMTP not configured — cannot email OTP in production.`);
      emailDelivery = "failed";
    }
  }

  return { devOtp, emailDelivery, message };
}

export async function verifyAdminActionOtp(params: {
  adminUserId: string;
  actionType: string;
  resourceId: string;
  otp: string;
}): Promise<void> {
  const { adminUserId, actionType, resourceId, otp } = params;

  if (!/^\d{6}$/.test(otp.trim())) {
    throw new AppError("A valid 6-digit code is required", 400);
  }

  const otpResult = await pool.query<{
    id: string;
    otp_hash: string;
    expires_at: Date;
  }>(
    `SELECT id, otp_hash, expires_at
     FROM admin_action_otps
     WHERE admin_user_id = $1
       AND action_type = $2
       AND resource_id = $3
       AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [adminUserId, actionType, resourceId]
  );

  const otpRow = otpResult.rows[0];
  if (!otpRow) {
    throw new AppError("Invalid or expired code", 400);
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    throw new AppError("Invalid or expired code", 400);
  }

  const matches = await bcrypt.compare(otp.trim(), otpRow.otp_hash);
  if (!matches) {
    throw new AppError("Invalid or expired code", 400);
  }

  await pool.query(
    `UPDATE admin_action_otps SET consumed_at = NOW() WHERE id = $1`,
    [otpRow.id]
  );
}
