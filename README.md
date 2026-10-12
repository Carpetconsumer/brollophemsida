# majaochfabian.se

Bröllopshemsida för Maja & Fabian, 10 juli 2027.

```
python tools/build_site.py          # bygger dist/index.html
npm install && npm run dev          # sidan + O.S.A.-backend lokalt på http://localhost:8787
npm test                            # tester för backend
python tools/map/build_mapdata.py   # (sällan) bygger om data/mapdata.json – kräver tools/map/requirements.txt
```

Sidan och backenden körs som en Cloudflare Worker; pushar till `main` publiceras automatiskt. Mer om uppbyggnad, publicering och vad som är kvar att göra finns i `CLAUDE.md`.
