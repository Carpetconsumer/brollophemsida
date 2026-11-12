"""Build the site: src/template.html + data/mapdata.json -> dist/index.html (one self-contained file),
plus the calendar files dist/brollop.ics (the day) and dist/osa.ics (the answer deadline).

    python tools/build_site.py

The template holds the page's <title>, font links and <style> first, then the body markup and script.
The map data is injected where the template says /*__MAPDATA__*/.
The calendar files are linked from the O.S.A. section and from the confirmation mail (worker/mejl.js).
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
tpl = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
data = (ROOT / "data" / "mapdata.json").read_text(encoding="utf-8")
json.loads(data)  # fail early on broken data
assert tpl.count("/*__MAPDATA__*/") == 1, "template must contain exactly one /*__MAPDATA__*/ placeholder"
assert "</" not in data, "map data must not contain '</' (it is inlined in a <script> tag)"

page = tpl.replace("/*__MAPDATA__*/", data)
split = page.index('<header class="top">')  # everything before the header belongs in <head>
head, body = page[:split].strip(), page[split:].strip()

doc = f"""<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Maja &amp; Fabian gifter sig lördag 10 juli 2027 – vigsel i S:ta Birgittas kapell, fest på Köpstadsö.">
{head}
</head>
<body>
{body}
</body>
</html>
"""
out = ROOT / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(doc, encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)} ({len(doc.encode('utf-8')) / 1024:.0f} KB)")


# ---------- calendar files (iCalendar, CRLF line endings, fixed stamps so the build stays deterministic) ----------
def ics_text(v):
    return v.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    # lines longer than 75 octets continue on the next line after a space
    out, raw = [], line.encode("utf-8")
    while len(raw) > 75:
        cut = 75 if not out else 74
        while (raw[cut] & 0xC0) == 0x80:  # never split a UTF-8 character
            cut -= 1
        out.append(raw[:cut].decode("utf-8"))
        raw = raw[cut:]
    out.append(raw.decode("utf-8"))
    return "\r\n ".join(out)


def calendar(uid, props, alarm):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//majaochfabian.se//SV", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "BEGIN:VEVENT", f"UID:{uid}@majaochfabian.se", "DTSTAMP:20261112T000000Z", *props,
             "BEGIN:VALARM", "ACTION:DISPLAY", f"TRIGGER:{alarm}", "DESCRIPTION:Påminnelse", "END:VALARM",
             "END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


CALENDARS = {
    # 12.30–02.30 svensk sommartid = 10.30–00.30 UTC
    "brollop.ics": calendar("brollop-2027", [
        "DTSTART:20270710T103000Z", "DTEND:20270711T003000Z",
        "SUMMARY:" + ics_text("Maja & Fabians bröllop"),
        "LOCATION:" + ics_text("S:ta Birgittas kapell, Klippan 2, 414 51 Göteborg"),
        "DESCRIPTION:" + ics_text("Vigsel kl. 12.30 i S:ta Birgittas kapell. Därefter båt ut till Köpstadsö och fest i Societetshuset Smutten.\nKlädkod: Kavaj.\nhttps://majaochfabian.se"),
        "URL:https://majaochfabian.se",
    ], "-P1D"),
    "osa.ics": calendar("osa-2027", [
        "DTSTART;VALUE=DATE:20270401", "DTEND;VALUE=DATE:20270402",
        "SUMMARY:" + ics_text("O.S.A. till Maja & Fabian"),
        "DESCRIPTION:" + ics_text("Sista dagen att svara om du kommer på bröllopet 10 juli 2027.\nhttps://majaochfabian.se/#osa"),
        "URL:https://majaochfabian.se/#osa",
        "TRANSP:TRANSPARENT",
    ], "-P3D"),
}
for name, text in CALENDARS.items():
    path = ROOT / "dist" / name
    path.write_bytes(text.encode("utf-8"))
    print(f"wrote {path.relative_to(ROOT)}")
