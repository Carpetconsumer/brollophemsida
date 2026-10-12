// O.S.A.: tar emot formuläret (POST /api/osa), sparar i D1 och mejlar gästen och oss.
// Svaren hämtas som CSV från GET /api/osa.csv?nyckel=<ADMIN_KEY>.
import { mailConfigured, sendMail } from "./mail.js";
import { guestMail, notifyMail } from "./mejl.js";

const MAX = { namn: 120, epost: 200, fler: 500, mat: 500, halsning: 2000 };
const MAX_CONFIRMATIONS_PER_DAY = 3;   // per e-postadress, så att formuläret inte kan användas för att spamma någon

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

// Returnerar { svar } eller { fel } med samma formuleringar som formuläret i webbläsaren.
export function validate(input) {
  if (!input || typeof input !== "object") return { fel: "Något gick fel med formuläret. Ladda om sidan och försök igen." };
  const str = (k) => (typeof input[k] === "string" ? input[k].trim() : "");
  const line = (k) => str(k).replace(/\s+/g, " ");   // enradiga fält: inga radbrytningar i t.ex. ämnesraden
  const svar = { namn: line("namn"), epost: line("epost"), kommer: input.kommer === "ja", fler: line("fler"), mat: line("mat"), halsning: str("halsning") };
  if (input.kommer !== "ja" && input.kommer !== "nej") return { fel: "Välj om du kommer eller inte." };
  if (!svar.namn) return { fel: "Skriv ditt namn, så vet vi vem som svarar." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(svar.epost)) return { fel: "Skriv en e-postadress som vi kan skicka bekräftelsen till." };
  for (const k of Object.keys(MAX)) if (svar[k].length > MAX[k]) return { fel: "Något av fälten är för långt. Korta ned det och försök igen." };
  if (!svar.kommer) { svar.fler = ""; svar.mat = ""; }
  return { svar };
}

export async function handleOsa(request, env, ctx) {
  if (request.method !== "POST") return json({ ok: false, fel: "Fel metod." }, 405);
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json({ ok: false, fel: "Fel format." }, 415);
  const raw = await request.text();
  if (raw.length > 10000) return json({ ok: false, fel: "Något av fälten är för långt. Korta ned det och försök igen." }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { input = null; }

  // fältet "webbplats" är dolt för människor; fyller någon i det är det en bot – svara som vanligt men spara inget
  if (input && typeof input.webbplats === "string" && input.webbplats.trim()) return json({ ok: true, bekraftelse: false });

  const { svar: s, fel } = validate(input);
  if (fel) return json({ ok: false, fel }, 400);

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM svar WHERE lower(epost) = lower(?1) AND bekraftelse = 'skickad' AND skapad > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')"
  ).bind(s.epost).first();
  const status = !mailConfigured(env) ? "av" : (recent?.n ?? 0) >= MAX_CONFIRMATIONS_PER_DAY ? "spärrad" : "";

  const row = await env.DB.prepare(
    "INSERT INTO svar (namn, epost, kommer, fler, mat, halsning, bekraftelse) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id"
  ).bind(s.namn, s.epost, s.kommer ? 1 : 0, s.fler, s.mat, s.halsning, status).first();

  if (mailConfigured(env)) ctx.waitUntil(sendMails(env, s, row.id, status === ""));
  return json({ ok: true, bekraftelse: status === "" });
}

async function sendMails(env, s, id, confirm) {
  const jobs = [];
  if (confirm) {
    jobs.push(sendMail(env, { to: s.epost, replyTo: env.NOTIFY_TO, ...guestMail(s) }).then(
      () => "skickad",
      (e) => { console.error("bekräftelse", id, String(e)); return "misslyckad"; }
    ));
  }
  if (env.NOTIFY_TO) {
    jobs.push(sendMail(env, { to: env.NOTIFY_TO, replyTo: s.epost, ...notifyMail(s) }).catch((e) => console.error("avisering", id, String(e))));
  }
  const [result] = await Promise.all(jobs);
  if (confirm) await env.DB.prepare("UPDATE svar SET bekraftelse = ?1 WHERE id = ?2").bind(result, id).run();
}

/* ---------- export ---------- */

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest("SHA-256", enc.encode(v))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

// Semikolon och BOM så att filen öppnas rätt i svenskt Excel; celler som börjar med = + - @ neutraliseras.
function cell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const stockholm = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });

export async function handleExport(request, env) {
  const key = new URL(request.url).searchParams.get("nyckel") || "";
  if (!env.ADMIN_KEY || !key || !(await sameSecret(key, env.ADMIN_KEY))) return new Response("Fel nyckel.", { status: 403 });
  const { results } = await env.DB.prepare("SELECT * FROM svar ORDER BY id").all();
  const head = ["Tid", "Namn", "E-post", "Kommer", "Fler i sällskapet", "Mat och allergier", "Hälsning", "Bekräftelse"];
  const lines = [head.map(cell).join(";")];
  for (const r of results) {
    const t = stockholm.format(new Date(r.skapad));
    lines.push([t, r.namn, r.epost, r.kommer ? "Ja" : "Nej", r.fler, r.mat, r.halsning, r.bekraftelse].map(cell).join(";"));
  }
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="osa-svar.csv"',
      "Cache-Control": "no-store",
    },
  });
}
