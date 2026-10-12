import json, math, random, heapq
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, box, Point, LineString
from shapely.ops import unary_union
from shapely import affinity
from scipy.ndimage import distance_transform_edt
from matplotlib.path import Path as MPath

import pathlib
HERE = pathlib.Path(__file__).resolve().parent
S = str(HERE / "input")
ROOT = HERE.parent.parent
LAT_C = 57.66
U_LAT = 20000.0
U_LON = U_LAT * math.cos(math.radians(LAT_C))
LON0, LAT0 = 11.56, 57.79
LON1, LAT1 = 12.04, 57.49
def P(lon, lat): return ((lon - LON0) * U_LON, (LAT0 - lat) * U_LAT)
W, H = P(LON1, LAT1)
print("world size", round(W), round(H), "unit m =", round(111320/U_LAT, 2))

r = json.load(open(f"{S}/map_rings.json")); big = json.load(open(f"{S}/coast_big.json"))
named = {n: Polygon(ring).buffer(0) for n, ring in r["rings"].items()}
named_union = unary_union(list(named.values()))
geo = []
for p in big:
    g = Polygon(list(zip(p["xs"], p["ys"]))).buffer(0)
    if g.is_empty or g.intersects(named_union): continue
    geo.append((None, g))
geo += list(named.items())
A = [U_LON, 0, 0, -U_LAT, -LON0 * U_LON, LAT0 * U_LAT]
clip = box(-150, -150, W + 150, H + 150)
world = []
for name, g in geo:
    pg = affinity.affine_transform(g, A)
    if name in ("Köpstadsö", "Styrsö", "Rivö", "Asperö"): pg = pg.buffer(-6)   # keep the cut straits open
    pg = pg.intersection(clip)
    for q in getattr(pg, "geoms", [pg]):
        if q.geom_type == "Polygon" and not q.is_empty: world.append((name, q))
# Göta älv east of Klippan is missing from the coastline set (treated as inland river): carve it in
river_ll = [(11.921, 57.6975), (11.925, 57.6985), (11.935, 57.7012), (11.945, 57.7038), (11.955, 57.7068), (11.963, 57.7100), (11.970, 57.7135), (11.978, 57.7165), (11.990, 57.7210), (12.005, 57.7260), (12.025, 57.7330), (12.070, 57.7480)]
river = LineString([P(*q) for q in river_ll]).buffer(31, cap_style=1)
world = [(n, q.difference(river)) for n, q in world]
world2 = []
for n, q in world:
    for part in getattr(q, "geoms", [q]):
        if part.geom_type == "Polygon" and not part.is_empty: world2.append((n, part))
world = world2
print("polygons", len(world))

def lod(tol, smooth, min_area):
    out = []
    for name, q in world:
        s = q.buffer(-smooth).buffer(smooth).buffer(smooth * 0.6).buffer(-smooth * 0.6) if smooth else q
        for part in getattr(s, "geoms", [s]):
            if part.geom_type != "Polygon" or part.area < min_area: continue
            part = part.simplify(tol)
            ring = list(part.exterior.coords)[:-1]
            if len(ring) < 3: continue
            flat = []
            for x, y in ring: flat += [round(x), round(y)]
            out.append(flat)
    return out
base = lod(0.8, 1.2, 15)   # keep (almost) every source vertex and the smallest skerries

# soften the source's staircase/straight runs (Gaussian contour smoothing, area kept for small skerries)
import os as _os
from scipy.ndimage import gaussian_filter1d
SIGW = float(_os.environ.get("SIGW", "12")); SPW = 1.5
def soft_flat(flat):
    q = Polygon(list(zip(flat[0::2], flat[1::2]))).buffer(0)
    if q.geom_type != "Polygon": q = max(q.geoms, key=lambda g: g.area)
    ring = LineString(q.exterior.coords); L = ring.length; n = max(16, int(L / SPW))
    pts = np.array([ring.interpolate(i * L / n).coords[0] for i in range(n)])
    sm = gaussian_filter1d(pts, SIGW / SPW, axis=0, mode="wrap")
    P_ = Polygon(sm).buffer(0)
    if P_.is_empty: return None
    if P_.geom_type != "Polygon": P_ = max(P_.geoms, key=lambda g: g.area)
    k = min(1.3, max(1.0, (q.area / max(P_.area, 1e-6)) ** 0.5))
    if k > 1.0001: P_ = affinity.scale(P_, k, k, origin=P_.centroid)
    P_ = P_.simplify(0.25)
    out = []
    for x, y in list(P_.exterior.coords)[:-1]: out += [x, y]
    return out
base = [b for b in (soft_flat(f) for f in base) if b and len(b) >= 6]
print("softened base rings", len(base), "pts", sum(len(b) // 2 for b in base))

# ---- fractal rock-coast detail below the source resolution (~130 m): original vertices stay put,
# each segment is subdivided with deterministic midpoint displacement (self-similar, amplitude ∝ length)
import struct, hashlib
from shapely.strtree import STRtree
def hrand(x, y, lvl):
    h = hashlib.blake2b(struct.pack("iii", int(round(x * 4)), int(round(y * 4)), lvl), digest_size=4).digest()
    u = int.from_bytes(h, "little") / 2**32 * 2 - 1
    return math.copysign(abs(u) ** 0.8, u)
def _g(i, j):
    h = hashlib.blake2b(struct.pack("ii", i, j), digest_size=4).digest()
    return int.from_bytes(h, "little") / 2**32
def vnoise(x, y):
    i, j = math.floor(x), math.floor(y); fx, fy = x - i, y - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = _g(i, j) + (_g(i + 1, j) - _g(i, j)) * fx
    b = _g(i, j + 1) + (_g(i + 1, j + 1) - _g(i, j + 1)) * fx
    return a + (b - a) * fy
def modu(x, y):   # stretches of smooth shore vs. broken rocky coast
    v = 0.65 * vnoise(x / 170, y / 170) + 0.35 * vnoise(x / 60 + 17.3, y / 60 - 4.1)
    return 0.2 + 1.25 * v ** 1.4
K, MINLEN, CAP = float(__import__("os").environ.get("ROUGH_K", "0.26")), 2.6, 6.0
def subdiv(a, b, lvl, out):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    if L < MINLEN: return
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    nx_, ny_ = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
    d = min(L * K, CAP) * hrand(mx, my, lvl) * modu(mx, my)
    m = (mx + nx_ * d, my + ny_ * d)
    subdiv(a, m, lvl + 1, out); out.append(m); subdiv(m, b, lvl + 1, out)
def roughen(flat):
    pts = list(zip(flat[0::2], flat[1::2])); out = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        out.append(a); subdiv(a, b, 0, out)
    return out
orig_polys = [Polygon(list(zip(f[0::2], f[1::2]))).buffer(0) for f in base]
rough = []
for f, op in zip(base, orig_polys):
    rr = np.array(roughen(f)); rr = gaussian_filter1d(rr, 0.9, axis=0, mode="wrap")   # round off the sharpest kinks
    rp = Polygon(rr).buffer(0)
    # keep the roughened coast within a band around the true coast
    rp = rp.intersection(op.buffer(9, join_style=2)).union(op.buffer(-9, join_style=2))
    rough.append(rp)
# never let neighbours merge or straits close
tree = STRtree(orig_polys); fixed = 0
for i in range(len(rough)):
    for j in tree.query(rough[i].buffer(3)):
        if j == i: continue
        if rough[i].distance(orig_polys[j]) < 3.5 or (j < i and rough[i].distance(rough[j]) < 2.0):
            rough[i] = rough[i].difference(orig_polys[j].buffer(4)).difference(rough[j].buffer(2.5) if j < i else Polygon()); fixed += 1
print("neighbour fixes", fixed)
fine = []
for rp in rough:
    for part in getattr(rp, "geoms", [rp]):
        if part.geom_type != "Polygon" or part.area < 12: continue
        ring = list(part.exterior.coords)[:-1]
        # half-unit precision
        flat = []
        for x, y in ring: flat += [round(x * 2) / 2, round(y * 2) / 2]
        fine.append(flat)
# ---- Köpstadsö: the coarse coastline splits the island at the harbour; join it where the satellite shows land
import sys; sys.path.insert(0, str(HERE)); import walk_geo as WG
_reg = WG.region(); _sat = WG.sat_land_in_region()
_polys = [Polygon(list(zip(f[0::2], f[1::2]))).buffer(0) for f in fine]
_touch = [i for i, p in enumerate(_polys) if p.intersects(_reg.buffer(2)) or p.intersects(WG.region_channel_world().buffer(2))]
_old = unary_union([_polys[i] for i in _touch])
_new = _old.difference(_reg).union(_sat).difference(WG.channel_water())
_new = _new.buffer(2.0, join_style=1).buffer(-2.0, join_style=1).buffer(-1.0, join_style=1).buffer(1.0, join_style=1)
fine = [f for i, f in enumerate(fine) if i not in _touch]
_parts = [g for g in getattr(_new, "geoms", [_new]) if g.geom_type == "Polygon" and g.area >= 12]
for part in _parts:
    flat = []
    for x, y in list(part.exterior.coords)[:-1]: flat += [round(x * 2) / 2, round(y * 2) / 2]
    fine.append(flat)
_mossk = Point(*WG.to_world(350, 950))
print("region fix: touched", len(_touch), "-> parts", len(_parts), "| venue & pier same island:",
      any(p.contains(Point(*WG.VENUE)) and p.contains(Point(*WG.PIER)) for p in _parts),
      "| SW island separate:", not any(p.contains(Point(*WG.VENUE)) and p.contains(_mossk) for p in _parts))
rough_union = unary_union([Polygon(list(zip(f[0::2], f[1::2]))).buffer(0) for f in fine])
coarse = []
for part in getattr(rough_union, "geoms", [rough_union]):
    if part.area < 150: continue
    s = part.simplify(2.2)
    if s.geom_type != "Polygon" or s.is_empty: continue
    ring = list(s.exterior.coords)[:-1]
    flat = []
    for x, y in ring: flat += [round(x), round(y)]
    coarse.append(flat)
print("fine rings", len(fine), "pts", sum(len(f)//2 for f in fine), "| coarse rings", len(coarse), "pts", sum(len(c)//2 for c in coarse))

land_fine = unary_union([Polygon(list(zip(f[0::2], f[1::2]))).buffer(0) for f in fine])

# ---- key places (chapel: centre of the OSM building outline, way 56433663)
CHAPEL_LON, CHAPEL_LAT = 11.9096, 57.6912
chapel = P(CHAPEL_LON, CHAPEL_LAT)
kopst = WG.PIER   # boat lands at the ferry pier (Ångbåtsbryggan)
venue = WG.VENUE
print("chapel on land:", land_fine.contains(Point(chapel)), "| village on land:", land_fine.contains(Point(kopst)))

# ---- boat route: A* through water with clearance
CELL = 6.0
x0, x1 = kopst[0] - 700, chapel[0] + 300
y0, y1 = chapel[1] - 300, kopst[1] + 500
nx, ny = int((x1 - x0) / CELL), int((y1 - y0) / CELL)
xs = x0 + (np.arange(nx) + 0.5) * CELL; ys = y0 + (np.arange(ny) + 0.5) * CELL
GX, GY = np.meshgrid(xs, ys)
pts = np.column_stack([GX.ravel(), GY.ravel()])
landmask = np.zeros(len(pts), bool)
region = box(x0, y0, x1, y1)
for f in fine:
    poly = Polygon(list(zip(f[0::2], f[1::2])))
    if not poly.intersects(region): continue
    mp = MPath(np.array(poly.exterior.coords))
    bb = poly.bounds
    sel = (pts[:, 0] >= bb[0]) & (pts[:, 0] <= bb[2]) & (pts[:, 1] >= bb[1]) & (pts[:, 1] <= bb[3])
    if sel.any(): landmask[sel] |= mp.contains_points(pts[sel])
land = landmask.reshape(ny, nx)
dist = distance_transform_edt(~land)   # cells to nearest land
from scipy.ndimage import label as _label
_lab, _ = _label(dist >= 1.5)
_sea = None
def nearest_water(pt, min_d=2.0):
    cx, cy = int((pt[0] - x0) / CELL), int((pt[1] - y0) / CELL)
    best = None
    for rr in range(1, 200):
        for j in range(max(0, cy - rr), min(ny, cy + rr + 1)):
            for i in range(max(0, cx - rr), min(nx, cx + rr + 1)):
                if dist[j, i] >= min_d and (_sea is None or _lab[j, i] == _sea):
                    d = (i - cx) ** 2 + (j - cy) ** 2
                    if best is None or d < best[0]: best = (d, i, j)
        if best: return best[1], best[2]
start = nearest_water(chapel, 2.5); _sea = _lab[start[1], start[0]]; goal = nearest_water(kopst, 2.0)
def cost(j, i):
    d = dist[j, i]
    if d < 1.5: return None
    return 1.0 + 14.0 / (d + 0.5)
openh = [(0, start)]; g = {start: 0}; came = {}
nbr = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414)]
while openh:
    _, cur = heapq.heappop(openh)
    if cur == goal: break
    ci, cj = cur
    for di, dj, w in nbr:
        ni, nj = ci + di, cj + dj
        if not (0 <= ni < nx and 0 <= nj < ny): continue
        c = cost(nj, ni)
        if c is None: continue
        ng = g[cur] + w * c
        if ng < g.get((ni, nj), 1e18):
            g[(ni, nj)] = ng; came[(ni, nj)] = cur
            h = math.hypot(goal[0] - ni, goal[1] - nj)
            heapq.heappush(openh, (ng + h, (ni, nj)))
path = [goal]
while path[-1] != start: path.append(came[path[-1]])
path.reverse()
line = [(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL) for i, j in path]
ls = LineString(line).simplify(10.0)
pts_r = list(ls.coords)
for _ in range(4):   # Chaikin smoothing
    new = [pts_r[0]]
    for a, b in zip(pts_r[:-1], pts_r[1:]):
        new += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
    new.append(pts_r[-1]); pts_r = new
# final approach: from open water in to the pier itself
_ex, _ey = pts_r[-1]; _px, _py = WG.PIER
_dx, _dy = _px - _ex, _py - _ey; _L = math.hypot(_dx, _dy)
_seg = LineString([(_ex, _ey), (_px, _py)])
_hit = _seg.intersection(land_fine.boundary)
_hits = [g for g in getattr(_hit, "geoms", [_hit]) if not g.is_empty]
_hp = min(_hits, key=lambda g: Point(_ex, _ey).distance(g)) if _hits else Point(_px, _py)
_hp = _hp if _hp.geom_type == "Point" else Point(_hp.coords[0])
_dock = (_hp.x - _dx / _L * 1.2, _hp.y - _dy / _L * 1.2)   # stop just off the quay
print("pier inland by", round(Point(_px, _py).distance(_hp), 1), "units")
_lx, _ly = pts_r[-2]
pts_r = pts_r[:-1] + [(_ex * 0.6 + _lx * 0.4, _ey * 0.6 + _ly * 0.4) if False else (_ex, _ey), ((_ex + _dock[0]) / 2, (_ey + _dock[1]) / 2), _dock]
print("dock leg units", round(_L, 1))
route = [[round(x, 1), round(y, 1)] for x, y in pts_r]
route_len_units = LineString(route).length
route_m = route_len_units * 111320 / U_LAT
print("route pts", len(route), "length km", round(route_m / 1000, 2), "nm", round(route_m / 1852, 2))
# ---- the walk as a winding footpath: smooth curve through the measured points + a gentle meander, kept on land
def _catmull(pts, step=0.8):
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1])); return out
_base = _catmull(WG.WALK)
_cum = [0.0]
for _i in range(1, len(_base)): _cum.append(_cum[-1] + math.hypot(_base[_i][0] - _base[_i - 1][0], _base[_i][1] - _base[_i - 1][1]))
_L = _cum[-1]; _safe = land_fine.buffer(-1.6)
walk_pts = []
for _i, (bx, by) in enumerate(_base):
    j0, j1 = max(0, _i - 1), min(len(_base) - 1, _i + 1)
    tx, ty = _base[j1][0] - _base[j0][0], _base[j1][1] - _base[j0][1]; tl = math.hypot(tx, ty) or 1
    nx_, ny_ = -ty / tl, tx / tl
    s_ = _cum[_i]; taper = min(1.0, s_ / 10.0, (_L - s_) / 10.0); taper = taper * taper * (3 - 2 * taper)
    off = taper * (3.0 * math.sin(2 * math.pi * s_ / 23.0) + 1.1 * math.sin(2 * math.pi * s_ / 8.5 + 1.3))
    f = 1.0
    while f > 0 and not _safe.contains(Point(bx + nx_ * off * f, by + ny_ * off * f)): f -= 0.25
    walk_pts.append((bx + nx_ * off * max(f, 0), by + ny_ * off * max(f, 0)))
_arr = np.array(walk_pts); from scipy.ndimage import gaussian_filter1d as _g1
_arr[1:-1] = _g1(_arr, 1.2, axis=0, mode="nearest")[1:-1]
walk_curve = [[round(x, 1), round(y, 1)] for x, y in _arr[::2].tolist()] + ([[round(_arr[-1][0], 1), round(_arr[-1][1], 1)]] if (len(_arr) - 1) % 2 else [])
print("walk curve pts", len(walk_curve), "len units", round(sum(math.hypot(walk_curve[i][0] - walk_curve[i-1][0], walk_curve[i][1] - walk_curve[i-1][1]) for i in range(1, len(walk_curve))), 1),
      "| outside land", round(LineString(walk_curve).difference(land_fine).length, 2))
from shapely.geometry import LineString as _LS
_wl = _LS(WG.WALK); print("walk len units", round(_wl.length, 1), "| walk outside land", round(_wl.difference(land_fine).length, 1), "| pier on land", land_fine.contains(Point(WG.PIER)), "| venue on land", land_fine.contains(Point(WG.VENUE)))
print("route touches land:", LineString(route).intersects(land_fine.buffer(-1)))

# ---- sea marks: hierarchical poisson points in water
rng = random.Random(10072027)
water_ok = lambda x, y: not land_fine.buffer(0).intersects(Point(x, y).buffer(28))
land_buf = land_fine.buffer(30)
marks = []
for level, rad in enumerate([320, 160, 80]):
    tries = 0
    target = {0: 400, 1: 1600, 2: 6000}[level]
    while tries < target * 6 and sum(1 for m in marks if m[2] == level) < target:
        tries += 1
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        if any((m[0] - x) ** 2 + (m[1] - y) ** 2 < rad * rad for m in marks): continue
        if land_buf.contains(Point(x, y)): continue
        marks.append((round(x), round(y), level, rng.randint(0, 999)))
print("marks per level", [sum(1 for m in marks if m[2] == L) for L in range(3)])


ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
def enc(flat):
    pts = [(int(round(x * 2)), int(round(y * 2))) for x, y in zip(flat[0::2], flat[1::2])]
    out = f"{pts[0][0]},{pts[0][1]},"; cx, cy = pts[0]
    for x, y in pts[1:]:
        while True:
            dx, dy = x - cx, y - cy
            if -31 <= dx <= 32 and -31 <= dy <= 32: break
            k = max(abs(dx), abs(dy)) / 30 + 1e-9; sx, sy = int(dx / k), int(dy / k)
            out += ALPH[sx + 31] + ALPH[sy + 31]; cx += sx; cy += sy
        out += ALPH[dx + 31] + ALPH[dy + 31]; cx, cy = x, y
    return out

def dm(v, pos, neg):
    hemi = pos if v >= 0 else neg; v = abs(v); d = int(v); mnt = (v - d) * 60
    return f"{d}°{mnt:04.1f}′ {hemi}".replace(".", ",")
data = {
    "w": round(W), "h": round(H), "unitM": round(111320 / U_LAT, 4),
    "fineEnc": [enc(f) for f in fine], "coarse": coarse, "route": route, "routeM": round(route_m), "walk": walk_curve, "walkM": WG.WALK_M,
    "marks": marks,
    "places": {
        "chapel": {"x": round(chapel[0], 1), "y": round(chapel[1], 1), "coord": dm(CHAPEL_LAT, "N", "S") + "  " + dm(CHAPEL_LON, "O", "V")},
        "island": {"x": round(venue[0], 1), "y": round(venue[1], 1), "coord": dm(LAT0 - venue[1] / U_LAT, "N", "S") + "  " + dm(LON0 + venue[0] / U_LON, "O", "V")},
        "pier": {"x": round(kopst[0], 1), "y": round(kopst[1], 1)},
        "city": {"x": round(P(11.966, 57.7065)[0]), "y": round(P(11.966, 57.7065)[1])},
    },
}
js = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
open(ROOT / "data" / "mapdata.json", "w").write(js)
print("json KB", round(len(js) / 1024))

# preview
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(16, 9), dpi=90)
for ax, (bx, by, bw) in zip(axs, [(0, 0, W), (chapel[0] - 900, chapel[1] - 700, 1900)]):
    for f in (coarse if ax is axs[0] else fine):
        ax.fill(f[0::2], f[1::2], color="#1f3fb3", alpha=0.12, lw=0.4, ec="#1f3fb3")
    rx, ry = zip(*route); ax.plot(rx, ry, color="#c03", lw=1)
    ax.plot(*chapel, "ko", ms=3); ax.plot(*kopst, "ko", ms=3)
    ax.set_xlim(bx, bx + bw); ax.set_ylim(by + bw * 1.1, by); ax.set_aspect("equal"); ax.axis("off")
axs[0].scatter([m[0] for m in marks if m[2] == 0], [m[1] for m in marks if m[2] == 0], s=2, c="#999")
plt.savefig(HERE / "route_preview.png", bbox_inches="tight")
