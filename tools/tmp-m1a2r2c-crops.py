#!/usr/bin/env python3
# TEMP critic crops + hole discrimination for m1a2 visual r2 verdict.
# Crops go to the session scratchpad (diagnosis only, never verdict evidence
# by themselves — verdict rects are measured on the official pairs).
import os
from PIL import Image
import numpy as np

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
OUT = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops"
os.makedirs(OUT, exist_ok=True)
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)

def load(name):
    return np.asarray(Image.open(f"{SHOTS}/{name}.png").convert("RGB"), dtype=np.uint8)

def crop(name, x0, y0, x1, y1, scale, tag):
    a = load(name)
    sub = a[y0:y1, x0:x1]
    im = Image.fromarray(sub).resize(((x1-x0)*scale, (y1-y0)*scale), Image.NEAREST)
    im.save(f"{OUT}/{tag}.png")
    print(f"{tag}: ({x0},{y0})-({x1},{y1}) x{scale}")

def hole_probe(name, x0, y0, x1, y1, tag):
    """Inside the rect: histogram of distance-to-bg for bg-tolerance pixels.
    EXACT clear-color (d<=1) = true see-through; d 5-13 = dark paint."""
    a = load(name).astype(np.int16)
    sub = a[y0:y1, x0:x1]
    d = np.abs(sub - BG).max(axis=2)
    n_exact = int((d <= 1).sum()); n_near = int(((d > 1) & (d <= 5)).sum())
    n_paint = int(((d > 5) & (d <= 13)).sum()); n_fg = int((d > 13).sum())
    print(f"{tag}: exact-bg(d<=1) {n_exact} | d2-5 {n_near} | d6-13 {n_paint} | fg {n_fg}")

# --- hole discrimination on the enclosed clusters ---
print("== HOLE PROBE (exact clear-color vs dark paint) ==")
hole_probe("view-top", 940, 236, 962, 277, "top: roof slot (946,242)-(956,271)")
hole_probe("view-top", 890, 80, 1030, 120, "top: rear rack gap field y84-117")
hole_probe("view-top", 218+640-640, 47, 421, 130, "top REF rear zone (ref pane)")
hole_probe("hero-toptilt", 1020, 288, 1042, 310, "toptilt: cluster (1028,294)")
hole_probe("hero-toptilt", 940, 408, 962, 434, "toptilt: cluster (946,414)")
hole_probe("view-left", 1028, 298, 1060, 315, "left: cluster (1034,303) 146px")
hole_probe("view-right", 858, 298, 892, 315, "right: cluster (864,303) 151px")
hole_probe("view-rear", 963, 150, 1004, 165, "rear: cluster (969,156) 180px")
hole_probe("view-front", 1016, 258, 1028, 296, "front: col cluster (1022,263)")

# --- crops for MG physics / hatches / grille / wheels / moire / containment ---
print("\n== CROPS ==")
# proc roof: CROWS + M240 + hatch rings (close-roof pane x>=640)
crop("close-roof", 960, 180, 1280, 340, 3, "proc-roof-hatch-crows")
crop("close-roof", 320, 180, 640, 340, 3, "ref-roof-cupola")   # ref cupola drums
crop("close-roof", 640, 330, 1000, 470, 3, "proc-roof-worksfield")
# view-top roof cluster
crop("view-top", 860, 220, 1070, 330, 3, "proc-top-roofcluster")
crop("view-top", 218, 150, 425, 340, 3, "ref-top-roofcluster")
crop("view-top", 855, 45, 1070, 145, 3, "proc-top-rearrack")
crop("view-top", 215, 45, 425, 145, 3, "ref-top-rearrack")
# MG hunt at hero range
crop("hero-toptilt", 900, 230, 1080, 330, 3, "proc-toptilt-roof")
crop("hero-toptilt", 250, 230, 480, 380, 3, "ref-toptilt-roof")
# front cheeks moire check
crop("view-front", 780, 150, 1140, 340, 2, "proc-front-turret")
crop("view-front", 140, 150, 500, 340, 2, "ref-front-turret")
crop("close-front", 780, 180, 1140, 380, 2, "proc-closefront-cheeks")
# rear grille
crop("view-rear", 830, 340, 1090, 460, 2, "proc-rear-plate")
crop("view-rear", 190, 330, 450, 450, 2, "ref-rear-plate")
# track containment: front/rear bottom corners
crop("view-front", 660, 250, 780, 460, 2, "proc-front-Ltrack")
crop("view-front", 1140, 250, 1260, 460, 2, "proc-front-Rtrack")
crop("view-rear", 660, 260, 790, 470, 2, "proc-rear-Ltrack")
crop("view-rear", 1150, 260, 1275, 470, 2, "proc-rear-Rtrack")
crop("close-front", 640, 330, 900, 470, 2, "proc-closefront-Lwrap")
# wheels: side band
crop("view-left", 740, 340, 1140, 400, 2, "proc-left-wheels")
crop("view-left", 100, 335, 500, 395, 2, "ref-left-wheels")
# glacis read
crop("close-front", 640, 300, 1100, 460, 2, "proc-closefront-glacis")
crop("close-front", 0, 280, 460, 450, 2, "ref-closefront-glacis")
# saddle duffels
crop("view-top", 880, 300, 1060, 400, 3, "proc-top-saddle")
crop("view-top", 230, 300, 415, 400, 3, "ref-top-saddle")

# --- front wrap columns (wheel-corridor claim, outer track faces only) ---
print("\n== FRONT WRAP RECTS (outer track faces) ==")
def luma_stats(a, x0, y0, x1, y1):
    sub = a[y0:y1, x0:x1].astype(np.float64)
    d = np.abs(a[y0:y1, x0:x1].astype(np.int16) - BG).max(axis=2)
    L = 0.299*sub[...,0] + 0.587*sub[...,1] + 0.114*sub[...,2]
    v = L[d > 13]
    if len(v) == 0: return "EMPTY"
    return f"n={len(v)} L={v.mean():.1f} sd={v.std():.1f} p05={np.percentile(v,5):.0f} p50={np.percentile(v,50):.0f} p95={np.percentile(v,95):.0f}"
a = load("view-front")
print("proc L wrap (688,290)-(740,430):", luma_stats(a, 688, 290, 740, 430))
print("proc R wrap (1180,290)-(1232,430):", luma_stats(a, 1180, 290, 1232, 430))
print("ref  L wrap (46,290)-(100,430):  ", luma_stats(a, 46, 290, 100, 430))
print("ref  R wrap (540,290)-(594,430): ", luma_stats(a, 540, 290, 594, 430))
