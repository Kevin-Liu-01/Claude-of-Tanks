#!/usr/bin/env python3
# TEMP independent-critic instrument for the m1a2 r6 GRADUATION verdict.
# Order-1 verification: wheel-row anatomy on the OFFICIAL pairs
# (shots/critic-m1a2/*.png). ITU-601 luma; bg |px-(0x15,0x1b,0x20)| maxch<=13.
# Re-derives the builder's done-gate: disc-row window world y 0.38..0.63,
# disc/gap luma contrast, wheel-pitch autocorrelation vs half-pitch.
# Also: order-2 duffel lobe profile (view-top crown rows, 1px cols) and
# proc skyline notch runs (r4-banked check the r4c tool under-printed).
import numpy as np
from PIL import Image

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)
TOL = 13

def load(name):
    return np.asarray(Image.open(f"{SHOTS}/{name}.png").convert("RGB"), dtype=np.uint8)

def bgmask(a):
    return np.abs(a.astype(np.int16) - BG).max(axis=2) <= TOL

def luma(a):
    f = a.astype(np.float64)
    return 0.299*f[...,0] + 0.587*f[...,1] + 0.114*f[...,2]

def fg_bbox(a, x0, x1):
    sub = a[:, x0:x1]
    fg = ~bgmask(sub)
    fg[:32, :120] = False
    ys, xs = np.where(fg)
    return (xs.min()+x0, ys.min(), xs.max()+x0, ys.max())

# ---- wheel-row analysis on side orthos ------------------------------------
# scale: px-per-meter from the pane's own tank height anchor is noisy (mast
# tips); use hull LENGTH anchor: proc/ref side bbox width covers muzzle-to-
# tail ~9.83 m (M1A2 published length gun fwd). Cross-check with the builder's
# pitch figure (0.745 m -> ~42 px => s ~56.4 px/m).
LEN_GUN_FWD = 9.83

def wheel_row(name, pane, x0, x1, tag):
    a = load(name)
    bb = fg_bbox(a, x0, x1)
    s = (bb[2]-bb[0]) / LEN_GUN_FWD  # px per meter
    ybot = bb[3]
    r0 = int(round(ybot - 0.63*s)); r1 = int(round(ybot - 0.38*s))
    L = luma(a); m = ~bgmask(a)
    cols = []
    for x in range(bb[0], bb[2]+1):
        v = L[r0:r1, x][m[r0:r1, x]]
        cols.append(v.mean() if len(v) else np.nan)
    cols = np.array(cols)
    # analysis span: central run only (skip 18% each end: sprocket/idler wraps)
    n = len(cols)
    a0, a1 = int(0.20*n), int(0.80*n)
    seg = cols[a0:a1]
    seg = np.where(np.isnan(seg), np.nanmean(seg), seg)
    segz = seg - seg.mean()
    pitch = 0.745 * s
    def ac(lag):
        lag = int(round(lag))
        if lag <= 0 or lag >= len(segz): return float("nan")
        c = np.corrcoef(segz[:-lag], segz[lag:])[0,1]
        return c
    acp, ach = ac(pitch), ac(pitch/2)
    # disc/gap contrast: local minima/maxima of a pitch-smoothed profile
    k = max(3, int(pitch/6))
    sm = np.convolve(seg, np.ones(k)/k, mode="same")
    discs, gaps = [], []
    w = int(pitch/2)
    i = w
    while i < len(sm)-w:
        win = sm[i-w:i+w]
        if sm[i] == win.max(): discs.append(sm[i])
        if sm[i] == win.min(): gaps.append(sm[i])
        i += 1
    disc = float(np.mean(sorted(discs)[-7:])) if discs else float("nan")
    gap  = float(np.mean(sorted(gaps)[:7]))  if gaps  else float("nan")
    print(f"{tag:22s} bbox {bb} s={s:.1f}px/m rows {r0}..{r1} "
          f"pitch {pitch:.1f}px | disc L {disc:.1f} gap L {gap:.1f} "
          f"contrast {disc-gap:+.1f} | AC(pitch) {acp:+.2f} AC(pitch/2) {ach:+.2f}")
    return dict(disc=disc, gap=gap, ac=acp)

print("== ORDER 1: wheel-row window (world y 0.38..0.63), official side panes ==")
for v in ("view-left", "view-right"):
    wheel_row(v, "ref", 0, 640, f"{v} ref")
    wheel_row(v, "proc", 640, 1280, f"{v} proc")

print("\n== ORDER 1: quarters (foreshortened) ==")
for v in ("view-rearleft", "view-rearright", "view-frontleft", "view-frontright"):
    wheel_row(v, "ref", 0, 640, f"{v} ref")
    wheel_row(v, "proc", 640, 1280, f"{v} proc")

# ---- order 2: duffel lobes from plan --------------------------------------
print("\n== ORDER 2: duffel-crown lobes (view-top rows 99-112, 1px cols) ==")
a = load("view-top")
L = luma(a); m = ~bgmask(a)
for tag, xr in (("ref ", (218, 422)), ("proc", (858, 1062))):
    prof = []
    for x in range(*xr):
        v = L[99:113, x][m[99:113, x]]
        prof.append(round(float(v.mean()),1) if len(v) else 0.0)
    p = np.array(prof)
    # report the profile coarsely + lobe/dip structure
    print(f"{tag} cols {xr}: " + " ".join(str(int(v)) for v in p[::5]))
    valid = p[p > 0]
    if len(valid):
        print(f"   max {valid.max():.0f} min {valid.min():.0f} (depth {valid.max()-valid.min():.0f}L)")

# ---- proc skyline (r4-banked broken-skyline check) -------------------------
print("\n== BANKED: proc skyline notch runs (sides; r4 class: L 2 runs, R 2 runs) ==")
for v in ("view-left", "view-right"):
    a = load(v)
    bb = fg_bbox(a, 640, 1280)
    fg = ~bgmask(a); fg[:32, :120] = False
    prof = []
    for x in range(bb[0], bb[2]+1):
        col = np.where(fg[:, x])[0]
        prof.append(col[0] if len(col) else -1)
    seg = np.array(prof)
    valid = seg[seg >= 0]
    plateau = np.percentile(valid, 20)
    runs, in_run, start = [], False, 0
    for i, ty in enumerate(seg):
        deep = ty >= 0 and (ty - plateau) >= 8
        if deep and not in_run: start, in_run = i, True
        elif not deep and in_run:
            runs.append((bb[0]+start, bb[0]+i-1, int(seg[start:i].max()-plateau))); in_run = False
    if in_run: runs.append((bb[0]+start, bb[0]+len(seg)-1, int(seg[start:].max()-plateau)))
    runs = [r for r in runs if r[1]-r[0] >= 3]
    # restrict to turret zone (above-hull skyline): drop bow/stern falloff runs
    inner = [r for r in runs if r[0] > bb[0]+30 and r[1] < bb[2]-30]
    print(f"{v} proc plateau~{plateau:.0f} inner notch-runs: {len(inner)} {inner[:10]}")
