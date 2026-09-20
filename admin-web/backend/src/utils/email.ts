import nodemailer from "nodemailer";

export type SendMailResult = {
  delivered: boolean;
  /** When SMTP is not configured, caller should surface OTP via server logs */
  smtpConfigured: boolean;
};

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM?.trim()
  );
}

/**
 * Send email via SMTP (works with AWS SES SMTP, Gmail App Password, etc.).
 * If SMTP_* env vars are missing, returns delivered:false so OTP can be logged.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendMailResult> {
  if (!isSmtpConfigured()) {
    return { delivered: false, smtpConfigured: false };
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  return { delivered: true, smtpConfigured: true };
}
