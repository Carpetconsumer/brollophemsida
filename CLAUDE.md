# majaochfabian.se – bröllopshemsida

Hemsida för Maja & Fabians bröllop **lördag 10 juli 2027**. Vigsel i S:ta Birgittas kapell på Klippan (Göteborg) kl. 12.30, gemensam båt ut i södra skärgården, fest i Societetshuset Smutten på Köpstadsö. Inbjudningskortet har en QR-kod till `https://majaochfabian.se`, så sidan måste ligga där innan korten skickas.

Allt innehåll är på svenska. Ton: varm, kort och rak – inga utfyllnadsord, inga emojis.

## Struktur

```
src/template.html       Sidan: <title>, typsnitt, <style>, markup och <script>. Kartdata injiceras vid /*__MAPDATA__*/
data/mapdata.json       Genererad kartdata (kust, rutt, promenad, platser, vågmarkeringar) – redigera inte för hand
tools/build_site.py     src/template.html + data/mapdata.json -> dist/index.html (en självständig fil)
tools/map/              Python-pipeline som bygger data/mapdata.json (se nedan)
dist/index.html         Byggd sida att publicera
print/                  Tryckfiler för inbjudan (A6) – referens, används inte av sidan
```

Bygg sidan: `python tools/build_site.py` (bara standardbiblioteket). Öppna `dist/index.html` direkt i en webbläsare för att testa.

## Sidans uppbyggnad (src/template.html)

- **Scrollberättelse**: en `position: sticky` canvas (`#map`) bakom sektionerna `hero → chapel (#vigsel) → boat (#baten) → island (#festen) → out`. Varje `<section data-cam="…">` styr kameran; `camFor(name, t)` ger `[x, y, s, fx, fy]` där `s` = världsenheter över skärmens kortsida och `fx/fy` = var kamerans centrum ligger på skärmen. Övergångar interpoleras med van Wijk/d3-zoom (`izoom`).
- **Båtfärden**: `D.route` ritas fram till båten under `#baten`; instrumenten (distans i sjömil, kurs, kompassnål) uppdateras i `updateUi`. På mobil (≤760 px) ligger båtkortet fast i nederkant och fälls ihop till bara instrumenten (`.riding`) efter 30 % av färden.
- **Promenaden**: `D.walk` (brygga → Smutten, uppmätt 774 m) ritas som prickad stig när man kommer till `#festen` (`walkT` i `state()`).
- **Karta**: `D.fineEnc` är kustlinjer i ett kompakt delta-format (halva enheter, 2 tecken per punkt); avkodas i `decode()`, förenklas i tre detaljnivåer (Douglas–Peucker, `FINE_TOL`) och ritas med mjuka kurvor. `D.coarse` används vid utzoomning. Världsenheter: 1 enhet ≈ 5,57 m.
- **Teman**: färgtoken i `:root` med mörkt läge via `prefers-color-scheme` och `[data-theme]`. `prefers-reduced-motion` respekteras.
- **Typsnitt**: Cormorant Garamond (rubriker) och Jost (brödtext) från Google Fonts.
- **Sektioner efter berättelsen**: Bra att veta (klädkod Kavaj, endast vuxna, gåvor via toastmasters, tal och spex, färjetider), O.S.A.-formulär, Kontakt, sidfot.

## Kartdata (tools/map)

`python tools/map/build_mapdata.py` skriver om `data/mapdata.json` (deterministiskt – samma indata ger samma fil). Kräver `pip install -r tools/map/requirements.txt`.

- `input/coast_big.json` – GSHHS full-resolution kust (ca 130 m noggrannhet) för området.
- `input/map_rings.json` – namngivna öar (Köpstadsö, Styrsö, Rivö, Asperö) som separerats manuellt.
- Kusten mjukas med Gauss-utjämning och får en svag fraktal klippkuststruktur under källdatans upplösning (stilval, inte verklig detalj).
- `walk_geo.py` + `input/walk_water.npy` + `input/walk_reg.json`: vatten/land-mask från en satellitbild runt Köpstadsös södra udde, registrerad mot kartan. Används för att foga ihop udden med ön, öppna sundet mot ön i sydväst och placera bryggan, Smutten och promenaden.
- Båtrutten räknas fram med A* genom vatten från kapellet till bryggan.

## Kvar att göra

1. **O.S.A. sparar inget** – formuläret validerar bara i webbläsaren (se `form.addEventListener("submit"…` och texten "Prototyp: svaren sparas inte någonstans än."). Behöver en backend, t.ex. Cloudflare Worker + D1/KV, Google Sheets eller Formspree, och bekräftelsemejl.
2. **Hosting på majaochfabian.se** – t.ex. Cloudflare Pages/Netlify/GitHub Pages med `dist/` som utdata och domänen kopplad.
3. **Toastmasters kontaktuppgifter** – Moas och Irmas telefonnummer och e-post är platshållare (`.ph`).
4. **Färjetider** – lördagstiderna (23.32, 00.52, 02.19 från Köpstadsö) kommer från sommartidtabellen 2026 för linje 281/282. Uppdatera när 2027 års tidtabell släpps.
5. *(Valfritt)* Live-avgångar från Västtrafiks API (Planera Resa v4). Kräver nyckel från developer.vasttrafik.se och en serverfunktion som håller nyckeln – får aldrig ligga i klientkoden.
6. Kapellets koordinat i kartdatan är ungefärlig.

## Arbetssätt

- Ändra i `src/template.html`, kör `python tools/build_site.py`, testa `dist/index.html` i desktop- och mobilbredd (393 px) och i mörkt läge.
- Behåll designen: blått `#1f3fb3` på `#f8f8f7`, tunna linjer, mycket luft.
- Kontaktuppgifter (telefon, e-post) är verkliga – ändra dem inte utan att fråga.

## Länkar

- Hemsidan som Claude-artefakt (prototypen): https://claude.ai/artifact/47PSiXZijpm7vwMVW8wemb
- Inbjudan och skisser (Design-vy): https://claude.ai/artifact/RPbEZwQAxbqHzce3b8nRr8
