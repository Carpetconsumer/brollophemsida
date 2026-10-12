# Walk from the ferry pier to the venue on Köpstadsö, taken from the couple's Google Maps
# measurement (774 m) and registered onto the website's map by land/water correlation.
import json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union
from shapely import affinity

import pathlib
S = str(pathlib.Path(__file__).resolve().parent / "input")
REG = json.load(open(f"{S}/walk_reg.json"))
K, OX, OY = REG["k"], REG["ox"], REG["oy"]

def to_world(px, py):
    return (OX + px / K, OY + py / K)

# path vertices in screenshot pixels: pier ("0") -> venue (end of the measured line)
PATH_PX = [(815, 822.5), (764, 833), (734, 821), (694, 846), (605.5, 688.5),
           (470, 702.5), (423.5, 728), (342.5, 682.5), (346, 610)]
WALK = [to_world(*p) for p in PATH_PX]
PIER = WALK[0]
VENUE = WALK[-1]
WALK_M = 774  # measured in Google Maps

def bridge():
    """Land that the coarse coastline is missing between the south lobe and the rest of the island,
    traced from the satellite land mask inside a small region around the isthmus."""
    from skimage import measure
    water = np.load(f"{S}/walk_water.npy")
    land = ndi.binary_opening(~water, iterations=7)
    region_px = [(455, 688), (620, 672), (720, 686), (812, 700), (820, 805), (720, 820), (600, 808), (468, 792)]
    xs = [p[0] for p in region_px]; ys = [p[1] for p in region_px]
    x0, x1, y0, y1 = int(min(xs)) - 4, int(max(xs)) + 4, int(min(ys)) - 4, int(max(ys)) + 4
    sub = np.zeros((y1 - y0 + 2, x1 - x0 + 2)); sub[1:-1, 1:-1] = land[y0:y1, x0:x1]   # zero border -> closed contours
    polys = []
    for c in measure.find_contours(sub, 0.5):
        p = Polygon([to_world(x - 1 + x0, y - 1 + y0) for y, x in c]).buffer(0)
        if not p.is_empty and p.area > 4: polys.append(p)
    region = Polygon([to_world(*p) for p in region_px])
    return unary_union(polys).intersection(region).buffer(1.5).buffer(-1.5)

# ---- replace the coarse coastline around the south lobe with the satellite outline:
# in reality the lobe is joined to Köpstadsö and separated from the island to the south-west by a channel
REGION_PX = [(290, 745), (470, 735), (800, 700), (880, 700), (1000, 760), (1000, 1000), (290, 1000)]

def region():
    return Polygon([to_world(*p) for p in REGION_PX])

def sat_land(region_px, open_iter=10):
    """Satellite land inside a pixel-space polygon, as world-unit geometry."""
    from skimage import measure
    water = np.load(f"{S}/walk_water.npy")
    land = ndi.binary_opening(~water, iterations=open_iter)          # drop ferry lines, labels and jetties
    xs = [p[0] for p in region_px]; ys = [p[1] for p in region_px]
    x0, x1, y0, y1 = max(0, int(min(xs)) - 6), int(max(xs)) + 6, max(0, int(min(ys)) - 6), int(max(ys)) + 6
    x1 = min(x1, land.shape[1]); y1 = min(y1, land.shape[0])
    sub = np.zeros((y1 - y0 + 2, x1 - x0 + 2)); sub[1:-1, 1:-1] = land[y0:y1, x0:x1]
    polys = []
    for c in measure.find_contours(sub, 0.5):
        p = Polygon([to_world(x - 1 + x0, y - 1 + y0) for y, x in c]).buffer(0)
        if not p.is_empty and p.area > 4: polys.append(p)
    acc = Polygon()
    for p in sorted(polys, key=lambda g: -g.area):   # even-odd: holes come back as their own contours
        acc = acc.symmetric_difference(p)
    reg = Polygon([to_world(*p) for p in region_px])
    return acc.buffer(-2.5).buffer(2.5).intersection(reg), reg   # opening also removes map-label strips

def sat_land_in_region():
    return sat_land(REGION_PX)[0]

# the channel between Köpstadsö and the island to the south-west, west of the replacement region
CHANNEL_PX = [(60, 755), (300, 755), (300, 870), (60, 870)]
def channel_water():
    land, reg = sat_land(CHANNEL_PX)
    return reg.difference(land)

def region_channel_world():
    return Polygon([to_world(*p) for p in CHANNEL_PX])
