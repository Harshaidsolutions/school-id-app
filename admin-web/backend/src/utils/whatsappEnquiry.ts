const ADMIN_WHATSAPP = "917799881779";

export function buildEnquiryText(input: {
  name: string;
  phone: string;
  email: string;
  message: string;
}): string {
  const lines = ["New website enquiry", `Name: ${input.name}`, `Phone: ${input.phone}`];
  if (input.email) lines.push(`Email: ${input.email}`);
  if (input.message) lines.push(`Message: ${input.message}`);
  return lines.join("\n");
}

type GraphResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
};

/**
 * Sends a text into the admin WhatsApp chat via WhatsApp Cloud API.
 * Returns delivered:false when the server has no token. Never treats a
 * missing or rejected send as success.
 */
export async function sendAdminWhatsApp(
  text: string
): Promise<{ delivered: true; messageId: string } | { delivered: false; reason: "not_configured" | "rejected" }> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const to = (process.env.WHATSAPP_TO || ADMIN_WHATSAPP).replace(/\D/g, "");
  if (!token || !phoneNumberId || to.length < 10 || to.length > 15) {
    return { delivered: false, reason: "not_configured" };
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  const body = (await response.json().catch(() => ({}))) as GraphResponse;
  const messageId = body.messages?.[0]?.id?.trim();
  if (!response.ok || !messageId) {
    console.error("WhatsApp enquiry was not accepted", body.error?.message || response.status);
    return { delivered: false, reason: "rejected" };
  }
  return { delivered: true, messageId };
}
