import env from "../../config/env.js";

// ======================================================
// Mail (Resend)
// ======================================================
//
// Every business mails from AtrioNovo's sending domain,
// with its own name as the sender and its own address as
// reply-to:
//
//   From:     Lotus Spa <facturen@mail.atrionovo.com>
//   Reply-To: info@lotusspa.be
//
// Without RESEND_API_KEY nothing is sent and the caller
// gets a clear error.
// ======================================================

export function mailConfigured() {
  return Boolean(env.resendApiKey);
}

function senderName(name) {
  // Quotes and angle brackets would break the header.
  return String(name ?? "AtrioNovo").replace(/["<>]/g, "").trim() || "AtrioNovo";
}

export async function sendMail({ fromName, replyTo, to, subject, text, html, attachments = [] }) {
  if (!env.resendApiKey) {
    throw new Error("Mail is not set up on the server.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${senderName(fromName)} <${env.mailFrom}>`,
      to: [to],
      reply_to: replyTo ? [replyTo] : undefined,
      subject,
      text,
      html,
      attachments: attachments.map((file) => ({
        filename: file.filename,
        content: file.content.toString("base64"),
      })),
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.message || `Resend answered ${response.status}.`);
  }

  return body.id;
}
