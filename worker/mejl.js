// Mejlen som O.S.A.-formuläret skickar: bekräftelse till gästen och avisering till oss.
// Varje mejl har en HTML-version i sidans stil och en textversion för klienter som inte visar HTML.

const SITE = "https://majaochfabian.se";
const MAPS = "https://www.google.com/maps/search/?api=1&query=S%3Ata+Birgittas+kapell+Klippan+2+G%C3%B6teborg";
const INK = "#1f3fb3", PAPER = "#f8f8f7", RULE = "#c9d1ee";
const DISPLAY = "'Cormorant Garamond', Garamond, Georgia, 'Times New Roman', serif";
const BODY = "Jost, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Det viktigaste om dagen, samma uppgifter som på hemsidan.
const DAY = [
  ["Datum", "Lördag 10 juli 2027"],
  ["Vigsel", "Kl. 12.30 i S:ta Birgittas kapell, Klippan 2, Göteborg", MAPS, "Hitta hit"],
  ["Båten", "Efter vigseln åker vi tillsammans med båt ut till Köpstadsö. Ingen behöver ordna egen resa."],
  ["Festen", "Societetshuset Smutten på Köpstadsö, en kort promenad från bryggan."],
  ["Klädkod", "Kavaj. Gärna en sommarkostym i ljusa färger, en påhittig kavaj eller en färgglad klänning – men framför allt: var er själva."],
  ["Barn", "Endast vuxna."],
  ["Tal och spex", "Anmäl till våra toastmasters Moa och Irma. Kontaktuppgifter finns på hemsidan."],
  ["Hemresa", "Skärgårdsfärjan går från Köpstadsö till Saltholmen under natten. Tiderna finns på hemsidan."],
];

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const firstName = (s) => s.namn.split(/\s+/)[0];

function answerRows(s) {
  const rows = [["Namn", s.namn], ["E-post", s.epost], ["Kommer", s.kommer ? "Ja" : "Nej"]];
  if (s.kommer) rows.push(["Fler i sällskapet", s.fler || "–"], ["Mat och allergier", s.mat || "–"]);
  rows.push(["Hälsning", s.halsning || "–"]);
  return rows;
}

/* ---------- text ---------- */

const textRows = (rows) => rows.map(([k, v]) => `${k}: ${v}`).join("\n");

/* ---------- HTML (tabeller och inline-stil, så att det ser likadant ut i Gmail, Outlook och Apple Mail) ---------- */

const caps = (t, color = INK) =>
  `<span style="font-family:${BODY};font-size:11px;line-height:16px;letter-spacing:3px;font-weight:400;color:${color};">${esc(t.toUpperCase())}</span>`;
const para = (html) =>
  `<tr><td style="padding-top:0;padding-bottom:18px;font-family:${BODY};font-size:16px;line-height:26px;font-weight:300;color:${INK};">${html}</td></tr>`;
const heading = (t) =>
  `<tr><td style="padding-top:22px;padding-bottom:14px;font-family:${DISPLAY};font-size:30px;line-height:34px;font-weight:300;color:${INK};">${esc(t)}</td></tr>`;

function facts(rows) {
  const tr = rows.map(([k, v, href, linkText]) => {
    const value = esc(v).replace(/\n/g, "<br>") + (href ? `<br><a href="${esc(href)}" style="color:${INK};text-decoration:underline;">${esc(linkText)} &#8599;</a>` : "");
    return `<tr>
<td width="128" valign="top" style="width:128px;padding-top:13px;padding-bottom:13px;padding-right:12px;border-top:1px solid ${RULE};">${caps(k)}</td>
<td valign="top" style="padding-top:10px;padding-bottom:13px;border-top:1px solid ${RULE};font-family:${BODY};font-size:15px;line-height:23px;font-weight:400;color:${INK};">${value}</td>
</tr>`;
  }).join("");
  return `<tr><td style="padding-bottom:18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid ${RULE};">${tr}</table></td></tr>`;
}

const button = (href, t) => `<tr><td style="padding-top:10px;padding-bottom:26px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${INK}" style="background-color:${INK};"><a href="${esc(href)}" style="display:inline-block;padding-top:15px;padding-bottom:15px;padding-left:30px;padding-right:30px;font-family:${BODY};font-size:12px;line-height:16px;letter-spacing:3px;color:${PAPER};text-decoration:none;">${esc(t.toUpperCase())}</a></td>
</tr></table></td></tr>`;

function page({ title, preheader, rows }) {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&amp;family=Jost:wght@300;400&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};">
<tr><td align="center" style="padding-top:44px;padding-bottom:36px;padding-left:20px;padding-right:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding-bottom:14px;">${caps("Vi gifter oss")}</td></tr>
<tr><td style="padding-bottom:16px;font-family:${DISPLAY};font-size:56px;line-height:56px;font-weight:300;color:${INK};">Maja <i style="font-size:36px;">&amp;</i> Fabian</td></tr>
<tr><td style="padding-bottom:30px;border-bottom:1px solid ${RULE};">${caps("Lördag 10 juli 2027")}</td></tr>
<tr><td style="padding-top:30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
</table>
</td></tr>
<tr><td bgcolor="${INK}" align="center" style="background-color:${INK};padding-top:30px;padding-bottom:30px;padding-left:20px;padding-right:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr>
<td style="font-family:${DISPLAY};font-size:26px;line-height:30px;font-style:italic;font-weight:300;color:${PAPER};">Maja &amp; Fabian</td>
</tr><tr>
<td style="padding-top:8px;"><a href="${SITE}" style="text-decoration:none;">${caps("10.07.2027 · majaochfabian.se", PAPER)}</a></td>
</tr></table>
</td></tr>
</table>
</body>
</html>
`;
}

/* ---------- mejlen ---------- */

export function guestMail(s) {
  const subject = "Tack för ditt svar – Maja & Fabian 10 juli 2027";
  const first = firstName(s);
  const intro = s.kommer
    ? "Tack för att du svarade. Vi har noterat att du kommer, och vi ser fram emot att fira med dig."
    : "Tack för att du svarade. Vad synd att du inte kan komma. Vi kommer att sakna dig.";
  const change = "Vill du ändra något? Svara på det här mejlet så ordnar vi det.";

  const dayText = s.kommer ? `\n\nDagen i korthet\n${textRows(DAY.map(([k, v]) => [k, v]))}\n\nMer information finns på ${SITE}` : "";
  const text = `Hej ${first}!\n\n${intro}${dayText}\n\nDitt svar\n${textRows(answerRows(s))}\n\n${change}\n\nVarma hälsningar\nMaja & Fabian\n`;

  const rows = [
    `<tr><td style="padding-bottom:14px;font-family:${DISPLAY};font-size:34px;line-height:38px;font-weight:300;color:${INK};">Hej ${esc(first)}!</td></tr>`,
    para(esc(intro)),
    ...(s.kommer ? [heading("Dagen i korthet"), facts(DAY), button(SITE, "Till hemsidan")] : []),
    heading("Ditt svar"),
    facts(answerRows(s)),
    para(esc(change)),
    para(`Varma hälsningar<br><span style="font-family:${DISPLAY};font-size:24px;line-height:32px;font-style:italic;">Maja &amp; Fabian</span>`),
  ].join("\n");
  const preheader = s.kommer ? "Vi ses den 10 juli. Här är det viktigaste om dagen." : "Tack för att du hörde av dig.";
  return { subject, text, html: page({ title: subject, preheader, rows }) };
}

export function notifyMail(s) {
  const subject = `O.S.A.: ${s.namn} – ${s.kommer ? "kommer" : "kommer inte"}`;
  const reply = `Svara på det här mejlet för att nå ${s.namn} direkt.`;
  const text = `${textRows(answerRows(s))}\n\n${reply}\n`;
  const rows = [
    `<tr><td style="padding-bottom:14px;font-family:${DISPLAY};font-size:34px;line-height:38px;font-weight:300;color:${INK};">${esc(s.namn)} ${s.kommer ? "kommer" : "kommer inte"}</td></tr>`,
    facts(answerRows(s)),
    para(esc(reply)),
  ].join("\n");
  return { subject, text, html: page({ title: subject, preheader: `Nytt O.S.A.-svar från ${s.namn}`, rows }) };
}
