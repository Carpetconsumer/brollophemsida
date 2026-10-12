"""Build the site: src/template.html + data/mapdata.json -> dist/index.html (one self-contained file).

    python tools/build_site.py

The template holds the page's <title>, font links and <style> first, then the body markup and script.
The map data is injected where the template says /*__MAPDATA__*/.
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
