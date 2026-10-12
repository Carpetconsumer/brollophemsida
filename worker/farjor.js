// GET /api/farjor: färjor från Köpstadsö till Saltholmen natten efter festen, från Västtrafiks API Planera Resa v4.
// Kräver secret VASTTRAFIK_KEY (autentiseringsnyckeln från developer.vasttrafik.se). Utan nyckel, eller innan Västtrafik
// har lagt in tidtabellen för juli 2027, svarar den { avgangar: null } och sidan visar de tider som står i HTML:en.
// Test: /api/farjor?datum=ÅÅÅÅ-MM-DD&nyckel=<ADMIN_KEY> hämtar en annan natt, utan cache, och visar eventuellt fel.
import { hasAdminKey } from "./osa.js";

const API = "https://ext-api.vasttrafik.se";
const NIGHT = "2027-07-10";

// från 22.30 den kvällen till 04.00 morgonen efter, svensk sommartid
function night(date) {
  const from = `${date}T22:30:00+02:00`;
  return { from, until: Date.parse(from) + 5.5 * 3600 * 1000 };
}

async function token(env) {
  const res = await fetch(`${API}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${env.VASTTRAFIK_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()).access_token;
}

async function api(path, tok) {
  const res = await fetch(`${API}/pr/v4${path}`, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function stopArea(name, tok) {
  const d = await api(`/locations/by-text?q=${encodeURIComponent(name)}&types=stoparea&limit=5`, tok);
  const hit = (d.results || []).find((r) => (r.name || "").toLowerCase().startsWith(name.toLowerCase()));
  if (!hit?.gid) throw new Error(`hittar ingen hållplats ${name}`);
  return hit.gid;
}

const hhmm = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
const fmt = (iso) => hhmm.format(new Date(iso)).replace(":", ".");

// Direktturer (en enda tripLeg) ur ett journeys-svar, sorterade, utan dubbletter.
export function parseJourneys(d, until = night(NIGHT).until) {
  const out = [];
  for (const r of d?.results || []) {
    const legs = r.tripLegs || [];
    if (legs.length !== 1 || legs[0].isCancelled) continue;
    const l = legs[0];
    const dep = l.origin?.estimatedOtherwisePlannedTime || l.origin?.plannedTime || l.estimatedOtherwisePlannedDepartureTime || l.plannedDepartureTime;
    const arr = l.destination?.estimatedOtherwisePlannedTime || l.destination?.plannedTime || l.estimatedOtherwisePlannedArrivalTime || l.plannedArrivalTime;
    const t = Date.parse(dep);
    if (Number.isNaN(t) || Number.isNaN(Date.parse(arr)) || t > until) continue;
    out.push({ t, avgar: fmt(dep), framme: fmt(arr), linje: l.serviceJourney?.line?.shortName || l.serviceJourney?.line?.name || "" });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((x, i) => i === 0 || x.avgar !== out[i - 1].avgar).map(({ t, ...rest }) => rest);
}

async function fetchDepartures(env, date = NIGHT) {
  const { from: dateTime, until } = night(date);
  const tok = await token(env);
  const [from, to] = await Promise.all([
    env.KOPSTADSO_GID || stopArea("Köpstadsö", tok),
    env.SALTHOLMEN_GID || stopArea("Saltholmen", tok),
  ]);
  const q = new URLSearchParams({ originGid: from, destinationGid: to, dateTime, limit: "6" });
  const list = parseJourneys(await api(`/journeys?${q}`, tok), until);
  return list.length ? list : null;
}

export async function handleFarjor(request, env, ctx) {
  const datum = new URL(request.url).searchParams.get("datum");
  if (datum) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !(await hasAdminKey(request, env))) return new Response("Fel nyckel.", { status: 403 });
    try { return Response.json({ avgangar: await fetchDepartures(env, datum) }); } catch (e) { return Response.json({ avgangar: null, fel: String(e) }); }
  }

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL("/api/farjor", request.url));
  const hit = cache && (await cache.match(key));
  if (hit) return hit;

  let avgangar = null;
  if (env.VASTTRAFIK_KEY) {
    try { avgangar = await fetchDepartures(env); } catch (e) { console.error("färjor:", String(e)); }
  }
  const res = new Response(JSON.stringify({ avgangar, hamtad: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${avgangar ? 6 * 3600 : 15 * 60}` },
  });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
