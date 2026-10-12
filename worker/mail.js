// Skickar e-post via Resend (secret RESEND_API_KEY) eller Cloudflare Email Service (send_email-bindningen EMAIL).
// Saknas båda skickas inget och funktionen returnerar false.

export function mailConfigured(env) {
  return Boolean(env.RESEND_API_KEY || env.EMAIL);
}

// msg: { to, subject, text, html?, replyTo? }
export async function sendMail(env, msg) {
  const from = env.MAIL_FROM;
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, reply_to: msg.replyTo }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return true;
  }
  if (env.EMAIL) {
    await env.EMAIL.send({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo });
    return true;
  }
  return false;
}
