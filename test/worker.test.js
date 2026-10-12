// Tester för workern: kör `npm test`. D1 ersätts av SQLite i minnet (node:sqlite) med samma migrering.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/index.js";
import { validate } from "../worker/osa.js";
import { parseJourneys } from "../worker/farjor.js";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_svar.sql", import.meta.url), "utf8"));
  return {
    sqlite: db,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { db.prepare(sql).run(...args); return { success: true }; },
      };
      return stmt;
    },
  };
}

let env, ctx, sent, realFetch;
beforeEach(() => {
  sent = [];
  env = {
    DB: fakeD1(),
    MAIL_FROM: "Maja & Fabian <osa@majaochfabian.se>",
    NOTIFY_TO: "majaochfabian@gmail.com",
    ADMIN_KEY: "hemlig-nyckel",
    EMAIL: { send: async (m) => { sent.push(m); return { messageId: "x" }; } },
    ASSETS: { fetch: async () => new Response("sidan") },
  };
  const pending = [];
  ctx = { waitUntil: (p) => pending.push(p), done: () => Promise.all(pending) };
  realFetch = globalThis.fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const post = (body, headers = { "Content-Type": "application/json" }) =>
  new Request("https://majaochfabian.se/api/osa", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const rows = () => env.DB.sqlite.prepare("SELECT * FROM svar ORDER BY id").all();
const yes = { namn: "Anna Svensson", epost: "anna@example.com", kommer: "ja", fler: "Erik", mat: "Vegetariskt", halsning: "Grattis!" };

/* ---------- O.S.A. ---------- */

test("validate: kräver namn, giltig e-post och ja/nej", () => {
  assert.match(validate({ ...yes, namn: "  " }).fel, /namn/);
  assert.match(validate({ ...yes, epost: "anna@example" }).fel, /e-postadress/);
  assert.match(validate({ ...yes, kommer: "kanske" }).fel, /Välj/);
  assert.match(validate({ ...yes, halsning: "x".repeat(2001) }).fel, /för långt/);
  assert.match(validate(null).fel, /formuläret/);
});

test("validate: nej rensar sällskap och mat, enradiga fält plattas till", () => {
  const { svar } = validate({ ...yes, kommer: "nej", namn: "Anna\nSvensson" });
  assert.equal(svar.kommer, false);
  assert.equal(svar.fler, "");
  assert.equal(svar.mat, "");
  assert.equal(svar.namn, "Anna Svensson");
});

test("svar sparas, gästen får bekräftelse och vi får avisering", async () => {
  const res = await worker.fetch(post(yes), env, ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, bekraftelse: true });
  await ctx.done();
  const [r] = rows();
  assert.equal(r.namn, "Anna Svensson");
  assert.equal(r.kommer, 1);
  assert.equal(r.fler, "Erik");
  assert.equal(r.bekraftelse, "skickad");
  const guest = sent.find((m) => m.to === "anna@example.com");
  const notify = sent.find((m) => m.to === "majaochfabian@gmail.com");
  assert.match(guest.text, /^Hej Anna!/);
  assert.match(guest.text, /Mat och allergier: Vegetariskt/);
  assert.match(guest.text, /Kl\. 12\.30 i S:ta Birgittas kapell/);
  assert.match(guest.html, /Dagen i korthet/);
  assert.match(notify.html, /Anna Svensson kommer/);
  assert.equal(guest.replyTo, "majaochfabian@gmail.com");
  assert.equal(notify.subject, "O.S.A.: Anna Svensson – kommer");
  assert.equal(notify.replyTo, "anna@example.com");
});

test("mejlen escapar det gästen skriver och nej-svaret saknar dagens program", async () => {
  await worker.fetch(post({ ...yes, namn: "<b>Eva</b> & co", halsning: "rad 1\n<script>x</script>" }), env, ctx);
  await worker.fetch(post({ ...yes, epost: "bo@example.com", namn: "Bo", kommer: "nej" }), env, ctx);
  await ctx.done();
  const [ja, , nej] = sent;
  assert.match(ja.html, /Hej &lt;b&gt;Eva&lt;\/b&gt;!/);
  assert.match(ja.html, /rad 1<br>&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(ja.html, /<script>|<b>Eva/);
  assert.match(ja.text, /^Hej <b>Eva<\/b>!/);
  assert.match(nej.html, /Vad synd att du inte kan komma/);
  assert.doesNotMatch(nej.html, /Dagen i korthet/);
  assert.doesNotMatch(nej.text, /Dagen i korthet/);
});

test("felaktigt formulär ger 400 med svensk text och sparar inget", async () => {
  const res = await worker.fetch(post({ ...yes, epost: "fel" }), env, ctx);
  assert.equal(res.status, 400);
  assert.match((await res.json()).fel, /e-postadress/);
  assert.equal(rows().length, 0);
  assert.equal((await worker.fetch(post("{inte json"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(post(yes, { "Content-Type": "text/plain" }), env, ctx)).status, 415);
  assert.equal((await worker.fetch(new Request("https://majaochfabian.se/api/osa"), env, ctx)).status, 405);
});

test("honungsfällan: botsvar sparas inte", async () => {
  const res = await worker.fetch(post({ ...yes, webbplats: "http://spam.example" }), env, ctx);
  assert.equal((await res.json()).ok, true);
  await ctx.done();
  assert.equal(rows().length, 0);
  assert.equal(sent.length, 0);
});

test("utan e-postkonfiguration sparas svaret ändå", async () => {
  delete env.EMAIL;
  const res = await worker.fetch(post(yes), env, ctx);
  assert.deepEqual(await res.json(), { ok: true, bekraftelse: false });
  await ctx.done();
  assert.equal(rows()[0].bekraftelse, "av");
});

test("högst tre bekräftelser per adress och dygn", async () => {
  for (let i = 0; i < 4; i++) { await worker.fetch(post(yes), env, ctx); await ctx.done(); }
  assert.deepEqual(rows().map((r) => r.bekraftelse), ["skickad", "skickad", "skickad", "spärrad"]);
  assert.equal(sent.filter((m) => m.to === "anna@example.com").length, 3);
  assert.equal(sent.filter((m) => m.to === "majaochfabian@gmail.com").length, 4);
});

test("misslyckat mejl markeras men svaret står kvar", async () => {
  env.EMAIL.send = async () => { throw new Error("E_SENDER_NOT_VERIFIED"); };
  const res = await worker.fetch(post(yes), env, ctx);
  assert.equal(res.status, 200);
  await ctx.done();
  assert.equal(rows()[0].bekraftelse, "misslyckad");
});

test("Resend används när RESEND_API_KEY finns", async () => {
  delete env.EMAIL;
  env.RESEND_API_KEY = "re_test";
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); };
  await worker.fetch(post(yes), env, ctx);
  await ctx.done();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ["anna@example.com"]);
  assert.equal(body.from, "Maja & Fabian <osa@majaochfabian.se>");
  assert.equal(body.reply_to, "majaochfabian@gmail.com");
  assert.match(body.html, /^<!DOCTYPE html>/);
  assert.match(body.text, /^Hej Anna!/);
  assert.equal(rows()[0].bekraftelse, "skickad");
});

test("CSV-export kräver nyckel och fungerar i svenskt Excel", async () => {
  await worker.fetch(post({ ...yes, halsning: "=HYPERLINK(\"x\")\nrad två" }), env, ctx);
  await worker.fetch(post({ ...yes, namn: "Bo", kommer: "nej" }), env, ctx);
  await ctx.done();
  const url = "https://majaochfabian.se/api/osa.csv";
  assert.equal((await worker.fetch(new Request(url), env, ctx)).status, 403);
  assert.equal((await worker.fetch(new Request(url + "?nyckel=fel"), env, ctx)).status, 403);
  const res = await worker.fetch(new Request(url + "?nyckel=hemlig-nyckel"), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/csv/);
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  assert.equal(text.charCodeAt(0), 0xfeff);
  const lines = text.slice(1).split("\r\n");
  assert.equal(lines[0], "Tid;Namn;E-post;Kommer;Fler i sällskapet;Mat och allergier;Hälsning;Bekräftelse");
  assert.match(lines[1], /;Anna Svensson;anna@example\.com;Ja;Erik;Vegetariskt;"'=HYPERLINK\(""x""\)\nrad två";skickad$/);
  assert.match(lines[2], /;Bo;anna@example\.com;Nej;;;Grattis!;skickad$/);
});

test("export utan ADMIN_KEY är avstängd", async () => {
  delete env.ADMIN_KEY;
  assert.equal((await worker.fetch(new Request("https://majaochfabian.se/api/osa.csv?nyckel="), env, ctx)).status, 403);
});

/* ---------- färjor ---------- */

const leg = (dep, arr, extra = {}) => ({
  origin: { plannedTime: dep }, destination: { plannedTime: arr },
  serviceJourney: { line: { shortName: "281", name: "Båt 281" } }, isCancelled: false, ...extra,
});

test("parseJourneys: direktturer i tidsordning, svensk tid", () => {
  const list = parseJourneys({
    results: [
      { tripLegs: [leg("2027-07-11T00:52:00+02:00", "2027-07-11T01:01:00+02:00")] },
      { tripLegs: [leg("2027-07-10T21:32:00Z", "2027-07-10T21:41:00Z")] },                            // 23.32 svensk tid
      { tripLegs: [leg("2027-07-10T23:40:00+02:00", "2027-07-11T00:20:00+02:00"), leg("a", "b")] },   // byte: hoppas över
      { tripLegs: [leg("2027-07-11T01:30:00+02:00", "2027-07-11T01:39:00+02:00", { isCancelled: true })] },
      { tripLegs: [leg("2027-07-11T06:00:00+02:00", "2027-07-11T06:09:00+02:00")] },                  // morgon: för sent
      { tripLegs: [leg("2027-07-11T00:52:00+02:00", "2027-07-11T01:01:00+02:00")] },                  // dubblett
    ],
  });
  assert.deepEqual(list, [
    { avgar: "23.32", framme: "23.41", linje: "281" },
    { avgar: "00.52", framme: "01.01", linje: "281" },
  ]);
});

test("parseJourneys: klarar tider direkt på tripLeg och tomt svar", () => {
  const l = { plannedDepartureTime: "2027-07-11T02:19:00+02:00", plannedArrivalTime: "2027-07-11T02:28:00+02:00", serviceJourney: { line: { name: "282" } } };
  assert.deepEqual(parseJourneys({ results: [{ tripLegs: [l] }] }), [{ avgar: "02.19", framme: "02.28", linje: "282" }]);
  assert.deepEqual(parseJourneys({}), []);
  assert.deepEqual(parseJourneys(null), []);
});

test("/api/farjor utan nyckel ger null så att sidans egna tider står kvar", async () => {
  const res = await worker.fetch(new Request("https://majaochfabian.se/api/farjor"), env, ctx);
  assert.equal((await res.json()).avgangar, null);
});

test("/api/farjor hämtar token, hållplatser och resor från Västtrafik", async () => {
  env.VASTTRAFIK_KEY = "a2V5OnNlY3JldA==";
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    seen.push(u.pathname);
    if (u.pathname === "/token") {
      assert.equal(init.headers.Authorization, "Basic a2V5OnNlY3JldA==");
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, "Bearer tok");
    if (u.pathname === "/pr/v4/locations/by-text") {
      const q = u.searchParams.get("q");
      return Response.json({ results: [{ name: "Brännö Rödsten", gid: "1" }, { name: `${q}, Göteborg`, gid: q === "Köpstadsö" ? "9021014004180000" : "9021014005650000" }] });
    }
    if (u.pathname === "/pr/v4/journeys") {
      assert.equal(u.searchParams.get("originGid"), "9021014004180000");
      assert.equal(u.searchParams.get("destinationGid"), "9021014005650000");
      assert.equal(u.searchParams.get("dateTime"), "2027-07-10T22:30:00+02:00");
      return Response.json({ results: [{ tripLegs: [leg("2027-07-10T23:32:00+02:00", "2027-07-10T23:41:00+02:00")] }] });
    }
    throw new Error("oväntat anrop " + url);
  };
  const res = await worker.fetch(new Request("https://majaochfabian.se/api/farjor"), env, ctx);
  assert.deepEqual((await res.json()).avgangar, [{ avgar: "23.32", framme: "23.41", linje: "281" }]);
  assert.deepEqual(seen.sort(), ["/pr/v4/journeys", "/pr/v4/locations/by-text", "/pr/v4/locations/by-text", "/token"]);
});

test("/api/farjor ger null när Västtrafik inte har tidtabellen än", async () => {
  env.VASTTRAFIK_KEY = "k";
  env.KOPSTADSO_GID = "1";
  env.SALTHOLMEN_GID = "2";
  globalThis.fetch = async (url) =>
    new URL(url).pathname === "/token" ? Response.json({ access_token: "tok" }) : new Response("utanför giltigt tidsintervall", { status: 400 });
  const res = await worker.fetch(new Request("https://majaochfabian.se/api/farjor"), env, ctx);
  assert.equal((await res.json()).avgangar, null);
});

/* ---------- routing ---------- */

test("okända /api-adresser ger 404, allt annat går till sidan", async () => {
  assert.equal((await worker.fetch(new Request("https://majaochfabian.se/api/nope"), env, ctx)).status, 404);
  assert.equal(await (await worker.fetch(new Request("https://majaochfabian.se/"), env, ctx)).text(), "sidan");
});
