// Studsar: Resend anropar POST /api/studs (webhook med händelserna email.bounced och email.suppressed) när ett mejl
// inte kommer fram. Gäller det en bekräftelse till en gäst blir svarets bekraftelse 'studsade' och vi får ett mejl om det.
// Anropen är signerade enligt Svix; nyckeln (whsec_…) står på webhooken hos Resend och sparas som RESEND_WEBHOOK_SECRET.
import { mailConfigured, sendMail } from "./mail.js";
import { bounceMail } from "./mejl.js";

const TOLERANCE = 5 * 60;   // sekunder mellan Resends tidsstämpel och nu, samma som i Svix eget bibliotek
const REASON = { "email.bounced": "bounce", "email.suppressed": "suppressed" };   // händelse -> fältet med felmeddelandet

const base64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// HMAC-SHA256 över "svix-id.svix-timestamp.kropp"; svix-signature kan innehålla flera "v1,<base64>" åtskilda av mellanslag
export async function verifySignature(headers, body, secret) {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), list = headers.get("svix-signature");
  if (!id || !ts || !list || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE) return false;
  try {
    const key = await crypto.subtle.importKey("raw", base64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const data = new TextEncoder().encode(`${id}.${ts}.${body}`);
    for (const part of list.split(" ")) {
      const [version, sig] = part.split(",");
      if (version === "v1" && sig && (await crypto.subtle.verify("HMAC", key, base64(sig), data))) return true;
    }
  } catch {
    // trasig nyckel eller signatur som inte är base64
  }
  return false;
}

const ok = () => new Response("ok");

export async function handleStuds(request, env) {
  if (!env.RESEND_WEBHOOK_SECRET) return new Response("Finns inte.", { status: 404 });
  if (request.method !== "POST") return new Response("Fel metod.", { status: 405 });
  const body = await request.text();
  if (!(await verifySignature(request.headers, body, env.RESEND_WEBHOOK_SECRET))) return new Response("Fel signatur.", { status: 401 });

  let event;
  try { event = JSON.parse(body); } catch { return new Response("Fel format.", { status: 400 }); }
  const field = REASON[event?.type];
  const mejlId = event?.data?.email_id;
  if (!field || !mejlId) return ok();

  // bara bekräftelser till gäster har ett sparat id; Resend kan skicka samma händelse mer än en gång
  const row = await env.DB.prepare("SELECT * FROM svar WHERE mejl_id = ?1").bind(mejlId).first();
  if (!row || row.bekraftelse === "studsade") return ok();

  // mejlet först: misslyckas det svarar vi 500 och Resend försöker igen, med raden orörd
  if (env.NOTIFY_TO && mailConfigured(env)) {
    await sendMail(env, { to: env.NOTIFY_TO, ...bounceMail({ ...row, kommer: Boolean(row.kommer) }, String(event.data[field]?.message || "")) });
  }
  await env.DB.prepare("UPDATE svar SET bekraftelse = 'studsade' WHERE id = ?1").bind(row.id).run();
  return ok();
}
