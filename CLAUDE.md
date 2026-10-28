# majaochfabian.se – bröllopshemsida

Hemsida för Maja & Fabians bröllop **lördag 10 juli 2027**. Vigsel i S:ta Birgittas kapell på Klippan (Göteborg) kl. 12.30, gemensam båt ut i södra skärgården, fest i Societetshuset Smutten på Köpstadsö. Inbjudningskortet har en QR-kod till `https://majaochfabian.se`, så sidan måste ligga där innan korten skickas.

Allt innehåll är på svenska. Ton: varm, kort och rak – inga utfyllnadsord, inga emojis.

## Struktur

```
src/template.html       Sidan: <title>, typsnitt, <style>, markup och <script>. Kartdata injiceras vid /*__MAPDATA__*/
data/mapdata.json       Genererad kartdata (kust, rutt, promenad, platser, vågmarkeringar) – redigera inte för hand
tools/build_site.py     src/template.html + data/mapdata.json -> dist/index.html (en självständig fil)
tools/map/              Python-pipeline som bygger data/mapdata.json (se nedan)
dist/index.html         Byggd sida att publicera (committas; CI kontrollerar att den är byggd från src + data)
worker/                 Cloudflare Worker: serverar dist/ och /api/* (O.S.A., CSV-export, färjetider)
migrations/             D1-schema (tabellen svar)
test/                   Tester för workern (`npm test`, D1 ersätts av SQLite i minnet)
wrangler.jsonc          Worker-konfiguration: assets, D1, domän, variabler
.github/workflows/      Testar varje push; publicerar main på majaochfabian.se
print/                  Tryckfiler för inbjudan (A6) – referens, används inte av sidan
```

Bygg sidan: `python tools/build_site.py` (bara standardbiblioteket). Öppna `dist/index.html` direkt i en webbläsare för att testa sidan; formuläret och färjetiderna behöver `npm run dev` (Worker + lokal D1 på http://localhost:8787).

## Sidans uppbyggnad (src/template.html)

- **Intro**: vid första laddningen (utan `#ankare` i adressen och utan `prefers-reduced-motion`) sätter ett litet skript i `<head>` klassen `intro` på `<html>`. Kartan tonar in, sedan glider hero-texten in rad för rad, och scrollningen är låst tills pilen är på plats (ca 2,7 s, `animationend` på `.cue`).
- **Toppraden** (`.top`) är dold över hero och visas när man scrollat 40 % av skärmhöjden (`updateUi`). Längst till höger en info-ikon som leder till Bra att veta (på mobil den enda länken).
- **Scrollberättelse**: en `position: sticky` canvas (`#map`) bakom sektionerna `hero → chapel (#vigsel) → boat (#baten) → island (#festen) → out`. Varje `<section data-cam="…">` styr kameran; `camFor(name, t)` ger `[x, y, s, fx, fy]` där `s` = världsenheter över skärmens kortsida och `fx/fy` = var kamerans centrum ligger på skärmen. Övergångar interpoleras med van Wijk/d3-zoom (`izoom`).
- **Båtfärden**: `D.route` ritas fram till båten (`boatGlyph`, en färja sedd ovanifrån) under `#baten`; instrumenten (distans i sjömil, kurs, kompassnål) uppdateras i `updateUi`. På mobil (≤760 px) ligger båtkortet fast i nederkant och fälls ihop till bara instrumenten (`.riding`) efter 30 % av färden.
- **Promenaden**: `D.walk` (brygga → Smutten, uppmätt 774 m) ritas som prickad stig när man kommer till `#festen` (`walkT` i `state()`).
- **Karta**: `D.fineEnc` är kustlinjer i ett kompakt delta-format (halva enheter, 2 tecken per punkt); avkodas i `decode()`, förenklas i tre detaljnivåer (Douglas–Peucker, `FINE_TOL`) och ritas med mjuka kurvor. `D.coarse` används vid utzoomning. Världsenheter: 1 enhet ≈ 5,57 m.
- **Teman**: färgtoken i `:root` med mörkt läge via `prefers-color-scheme` och `[data-theme]`. `prefers-reduced-motion` respekteras.
- **Typsnitt**: Cormorant Garamond (rubriker) och Jost (brödtext) från Google Fonts.
- **Sektioner efter berättelsen**: Bra att veta (klädkod Kavaj, endast vuxna, gåvor via toastmasters, tal och spex, tillgänglighet, färjetider), O.S.A.-formulär, Kontakt, sidfot.

## Kartdata (tools/map)

`python tools/map/build_mapdata.py` skriver om `data/mapdata.json` (deterministiskt – samma indata ger samma fil). Kräver `pip install -r tools/map/requirements.txt`.

- `input/coast_big.json` – GSHHS full-resolution kust (ca 130 m noggrannhet) för området.
- `input/map_rings.json` – namngivna öar (Köpstadsö, Styrsö, Rivö, Asperö) som separerats manuellt.
- Kusten mjukas med Gauss-utjämning och får en svag fraktal klippkuststruktur under källdatans upplösning (stilval, inte verklig detalj).
- `walk_geo.py` + `input/walk_water.npy` + `input/walk_reg.json`: vatten/land-mask från en satellitbild runt Köpstadsös södra udde, registrerad mot kartan. Används för att foga ihop udden med ön, öppna sundet mot ön i sydväst och placera bryggan, Smutten och promenaden.
- Båtrutten räknas fram med A* genom vatten från kapellet till bryggan.

## Backend (worker/)

En Cloudflare Worker serverar `dist/` som statiska filer och svarar på `/api/*`:

- `POST /api/osa` (`worker/osa.js`): validerar som formuläret, sparar en rad i D1-tabellen `svar` (inget skrivs över), mejlar gästen en bekräftelse och oss en avisering med svaret (reply-to åt båda hållen). Mejlen skickas efter svaret med `waitUntil`; kolumnen `bekraftelse` blir `skickad`, `misslyckad`, `spärrad` (fler än tre till samma adress per dygn) eller `av` (ingen e-post konfigurerad). Ett dolt fält `webbplats` fångar botar.
- `GET /api/osa.csv?nyckel=<ADMIN_KEY>`: alla svar som CSV (semikolon + BOM, öppnas direkt i svenskt Excel).
- `GET /api/farjor` (`worker/farjor.js`): färjor Köpstadsö → Saltholmen natten 10–11 juli 2027 från Västtrafiks Planera Resa v4 (`journeys`), cachas 6 h. Ger `{ avgangar: null }` utan nyckel eller innan Västtrafik har tidtabellen; då står tiderna i HTML:en kvar. Felsökning: `/api/farjor?datum=ÅÅÅÅ-MM-DD&nyckel=<ADMIN_KEY>` hämtar en annan natt utan cache och visar Västtrafiks felmeddelande.
- E-post (`worker/mail.js`): Resend om `RESEND_API_KEY` finns, annars Cloudflare Email Service om bindningen `EMAIL` finns, annars inget. Mejlen (`worker/mejl.js`) har en HTML-version i sidans stil (tabeller och inline-stil för Gmail/Outlook) och en textversion. Bekräftelsen till den som kommer innehåller "Dagen i korthet" – håll den i takt med hemsidan.

Hemligheter (sätts med `npx wrangler secret put NAMN` eller i Cloudflare under Worker → Settings → Variables and Secrets): `ADMIN_KEY`, `RESEND_API_KEY`, `VASTTRAFIK_KEY`. Lokalt läggs de i `.dev.vars` (ignoreras av git). Vanliga variabler (`MAIL_FROM`, `NOTIFY_TO`) står i `wrangler.jsonc`.

## Publicering

Pushar till `main` testas och publiceras av `.github/workflows/publicera.yml` (`wrangler d1 migrations apply` + `wrangler deploy`). D1-databasen `majaochfabian-osa` finns redan i Cloudflare-kontot. Det här behöver göras en gång, i den här ordningen:

1. **Flytta DNS till Cloudflare.** Domänen ligger hos one.com (namnservrar `ns01/ns02.one.com`, visar en parkeringssida). I Cloudflare: *Add a domain* → `majaochfabian.se` → Free. Byt sedan namnservrar hos one.com (DNS-inställningar → egna namnservrar) till de två som Cloudflare anger och vänta tills Cloudflare visar domänen som aktiv. Workerns `routes` kopplar `majaochfabian.se` och `www` och fungerar först då.
2. **API-token för GitHub.** Cloudflare → My Profile → API Tokens → mallen *Edit Cloudflare Workers*, lägg till *Account → D1 → Edit* och *Zone → DNS → Edit*, och välj zonen majaochfabian.se. Lägg token som repo-secret `CLOUDFLARE_API_TOKEN` och konto-id:t (står på Cloudflares översiktssida) som `CLOUDFLARE_ACCOUNT_ID` i GitHub → Settings → Secrets and variables → Actions.
3. **E-post.** Skapa ett konto på resend.com (gratis upp till 3 000 mejl/månad), lägg till domänen `majaochfabian.se`, lägg in DNS-posterna som Resend visar i Cloudflare DNS och skapa en API-nyckel med sändrätt → `npx wrangler secret put RESEND_API_KEY`. (Alternativ utan Resend: Cloudflare Email Service kräver Workers Paid, 5 USD/månad, för att mejla gästerna. Onboarda domänen där och lägg till `"send_email": [{ "name": "EMAIL" }]` i `wrangler.jsonc`.)
4. **Nyckel för svarslistan.** `npx wrangler secret put ADMIN_KEY` med en lång slumpad sträng. Svaren hämtas sedan på `https://majaochfabian.se/api/osa.csv?nyckel=…`.
5. **Västtrafik** (för färjetiderna). Registrera ett konto på developer.vasttrafik.se, skapa en applikation, prenumerera på *Planera Resa v4* och kopiera applikationens autentiseringsnyckel (base64) → `npx wrangler secret put VASTTRAFIK_KEY`.
6. Merga till `main`. Kontrollera sedan att https://majaochfabian.se visar sidan och skicka ett testsvar.

## Kvar att göra

1. **Publicera** – stegen under Publicering ovan (DNS, nycklar, e-post). Måste vara klart innan korten skickas.
2. **Toastmasters kontaktuppgifter** – Moas och Irmas telefonnummer och e-post är platshållare (`.ph`) i Kontakt-sektionen.
3. **Färjetider** – sidan visar lördagstiderna från sommartidtabellen 2026 (23.32, 00.52, 02.19 från Köpstadsö, linje 281/282) tills `/api/farjor` får 2027 års tider från Västtrafik. Byt gärna även de tryckta tiderna i `src/template.html` när tidtabellen släpps, så att de stämmer om API:et inte svarar.

## Arbetssätt

- Ändra i `src/template.html`, kör `python tools/build_site.py`, testa `dist/index.html` i desktop- och mobilbredd (393 px) och i mörkt läge.
- Ändringar i `worker/`: kör `npm test` och prova med `npm run dev`.
- Behåll designen: blått `#1f3fb3` på `#f8f8f7`, tunna linjer, mycket luft.
- Kontaktuppgifter (telefon, e-post) är verkliga – ändra dem inte utan att fråga.

## Länkar

- Hemsidan som Claude-artefakt (prototypen): https://claude.ai/artifact/47PSiXZijpm7vwMVW8wemb
- Inbjudan och skisser (Design-vy): https://claude.ai/artifact/RPbEZwQAxbqHzce3b8nRr8
