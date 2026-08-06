#!/usr/bin/env python3
# TEMP r4 critic: skyline lane scan (fixed pane-frame indices) + under-rail sky
# audit at the ordered lane stations, both panes. TOL13 bg mask.
from PIL import Image
import numpy as np

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)
TOL = 13

def load(name):
    return np.asarray(Image.open(f"{SHOTS}/{name}.png").convert("RGB"), dtype=np.uint8)

def bgmask(a):
    return (np.abs(a.astype(np.int16) - BG).max(axis=2)) <= TOL

def pane(a, side):
    return a[:, :640] if side == "ref" else a[:, 640:]

def top_profile(p):
    fg = ~bgmask(p)
    fg[:32, :120] = False
    h, w = fg.shape
    prof = np.full(w, -1, dtype=int)
    for x in range(w):
        col = np.where(fg[:, x])[0]
        if len(col): prof[x] = col[0]
    return prof

def bbox(p):
    fg = ~bgmask(p)
    fg[:32, :120] = False
    ys, xs = np.where(fg)
    return xs.min(), ys.min(), xs.max(), ys.max()

def notches(prof, x0, x1, mindepth=8, minwide=4):
    seg = prof[x0:x1+1]
    valid = seg[seg >= 0]
    plateau = np.percentile(valid, 20)
    runs = []
    in_run = False
    start = 0
    for i, ty in enumerate(seg):
        deep = ty >= 0 and (ty - plateau) >= mindepth
        if deep and not in_run:
            start = i; in_run = True
        elif not deep and in_run:
            runs.append((int(x0+start), int(x0+i-1), int(seg[start:i].max()-plateau)))
            in_run = False
    if in_run: runs.append((int(x0+start), int(x0+len(seg)-1), int(seg[start:].max()-plateau)))
    return plateau, [r for r in runs if r[1]-r[0]+1 >= minwide]

def sky_in_band(p, x0, x1, y0, y1, label):
    """count bg px inside the band (open sky reaching in from above OR enclosed)"""
    sub = bgmask(p[y0:y1+1, x0:x1+1])
    cols = sub.sum(axis=0)
    runs = []
    in_run = False
    start = 0
    for i, v in enumerate(cols >= 2):
        if v and not in_run: start = i; in_run = True
        elif not v and in_run:
            runs.append((int(x0+start), int(x0+i-1))); in_run = False
    if in_run: runs.append((int(x0+start), int(x0+x1-x0)))
    print(f"  {label}: sky px {int(sub.sum())} in rows {y0}-{y1}, col-runs(>=2px) {runs}")

for v in ["view-left", "view-right"]:
    a = load(v)
    print(f"== {v} ==")
    for side in ("ref", "proc"):
        p = pane(a, side)
        bx0, by0, bx1, by1 = bbox(p)
        prof = top_profile(p)
        # turret zone: central 60% of the hull span (excludes gun barrel ends)
        tx0 = int(bx0 + 0.12*(bx1-bx0)); tx1 = int(bx0 + 0.80*(bx1-bx0))
        plateau, runs = notches(prof, tx0, tx1)
        off = 0 if side == "ref" else 640
        runs_abs = [(r[0]+off, r[1]+off, r[2]) for r in runs]
        print(f"  {side} bbox x {bx0+off}-{bx1+off} turretzone {tx0+off}-{tx1+off} plateau_y~{plateau:.0f} "
              f"notch-runs: {len(runs_abs)} {runs_abs}")
    # under-rail sky at the ordered stations: rows just under the proc plateau
    # proc lane pocket found by census at (963,257)-(984,267) L / (935,251)-(957,267) R
    print("  under-rail sky audit (rows 248-275):")
    sky_in_band(pane(a, "ref"), 46, 594, 248, 275, "ref  x46-594")
    sky_in_band(pane(a, "proc"), 45, 593, 248, 275, "proc x45-593(pane)")
print()
# front skyline rows 140-180 (certified front rows — lanes must read as slots, sky not required)
a = load("view-front")
for side in ("ref", "proc"):
    p = pane(a, side)
    sub = bgmask(p[140:181, 45:595])
    print(f"view-front {side} sky px rows140-180: {int(sub.sum())}")
