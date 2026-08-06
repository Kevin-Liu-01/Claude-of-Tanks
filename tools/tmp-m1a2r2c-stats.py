#!/usr/bin/env python3
# TEMP independent-critic measurement rig for m1a2 visual r2 (shaded-parity r2 verdict).
# Reads ONLY shots/critic-m1a2/*.png (official pairs, fresh render 2026-08-03 13:51).
# ITU-601 luma; bg discriminator |px-(0x15,0x1b,0x20)| maxch <= 13 (claims law D).
import sys, math
from PIL import Image
import numpy as np

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)
TOL = 13

def load(name):
    im = Image.open(f"{SHOTS}/{name}.png").convert("RGB")
    return np.asarray(im, dtype=np.uint8)

def bgmask(a):
    return (np.abs(a.astype(np.int16) - BG).max(axis=2) <= TOL)

def luma(a):
    f = a.astype(np.float64)
    return 0.299*f[...,0] + 0.587*f[...,1] + 0.114*f[...,2]

def fg_bbox(a, x0, x1):
    sub = a[:, x0:x1]
    fg = ~bgmask(sub)
    fg[:32, :120] = False  # pane label text
    ys, xs = np.where(fg)
    if len(xs) == 0: return None
    return (xs.min()+x0, ys.min(), xs.max()+x0, ys.max())

def rect_stats(a, x0, y0, x1, y1, skip_bg=True):
    sub = a[y0:y1, x0:x1]
    L = luma(sub)
    if skip_bg:
        m = ~bgmask(sub)
        vals = L[m]
    else:
        vals = L.flatten()
    if len(vals) == 0: return dict(n=0)
    return dict(n=int(len(vals)), mean=float(vals.mean()), sd=float(vals.std()),
                p05=float(np.percentile(vals,5)), p50=float(np.percentile(vals,50)),
                p95=float(np.percentile(vals,95)))

def warm_census(a, x0, x1, margin=6):
    """salmon/maroon hunt: pixels where R exceeds G by margin (fg only)."""
    sub = a[:, x0:x1].astype(np.int16)
    fg = ~bgmask(a[:, x0:x1])
    fg[:32, :120] = False
    warm = (sub[...,0] - sub[...,1] >= margin) & fg
    n = int(warm.sum())
    out = dict(n=n, total=int(fg.sum()))
    if n:
        ys, xs = np.where(warm)
        out["bbox"] = (int(xs.min())+x0, int(ys.min()), int(xs.max())+x0, int(ys.max()))
        # strong warm (salmon class): R-G >= 18
        strong = (sub[...,0] - sub[...,1] >= 18) & fg
        out["strong"] = int(strong.sum())
        if out["strong"]:
            ys2, xs2 = np.where(strong)
            out["strong_bbox"] = (int(xs2.min())+x0, int(ys2.min()), int(xs2.max())+x0, int(ys2.max()))
    return out

def enclosed_air(a, x0, x1):
    """flood fill bg from border of pane; enclosed bg px = holes/sky-through."""
    sub = bgmask(a[:, x0:x1])
    h, w = sub.shape
    seen = np.zeros_like(sub, dtype=bool)
    stack = []
    for x in range(w):
        if sub[0,x]: stack.append((0,x))
        if sub[h-1,x]: stack.append((h-1,x))
    for y in range(h):
        if sub[y,0]: stack.append((y,0))
        if sub[y,w-1]: stack.append((y,w-1))
    while stack:
        y, x = stack.pop()
        if seen[y,x] or not sub[y,x]: continue
        # scanline fill
        xl = x
        while xl > 0 and sub[y,xl-1] and not seen[y,xl-1]: xl -= 1
        xr = x
        while xr < w-1 and sub[y,xr+1] and not seen[y,xr+1]: xr += 1
        seen[y, xl:xr+1] = True
        for yy in (y-1, y+1):
            if 0 <= yy < h:
                xx = xl
                while xx <= xr:
                    if sub[yy,xx] and not seen[yy,xx]:
                        stack.append((yy,xx))
                        while xx <= xr and sub[yy,xx]: xx += 1
                    else:
                        xx += 1
    enc = sub & ~seen
    n = int(enc.sum())
    out = dict(n=n)
    if n:
        ys, xs = np.where(enc)
        # cluster summary: report up to 6 clusters by bbox via simple labeling
        try:
            from scipy import ndimage
            lab, k = ndimage.label(enc)
            clusters = []
            for i in range(1, k+1):
                ys2, xs2 = np.where(lab == i)
                clusters.append((int(len(xs2)), int(xs2.min())+x0, int(ys2.min()), int(xs2.max())+x0, int(ys2.max())))
            clusters.sort(reverse=True)
            out["clusters"] = clusters[:8]
        except ImportError:
            out["bbox"] = (int(xs.min())+x0, int(ys.min()), int(xs.max())+x0, int(ys.max()))
    return out

def top_profile(a, x0, x1, xa, xb):
    """for each col in [xa,xb) (pane-abs), first fg row from top. Returns list."""
    sub = ~bgmask(a[:, x0:x1])
    sub[:32, :120] = False
    prof = {}
    for x in range(xa, xb):
        col = sub[:, x-x0]
        nz = np.where(col)[0]
        prof[x] = int(nz[0]) if len(nz) else -1
    return prof

def fmt(s):
    if s.get("n", 0) == 0: return "EMPTY"
    return (f"n={s['n']} L={s['mean']:.1f} sd={s['sd']:.1f} "
            f"p05={s['p05']:.0f} p50={s['p50']:.0f} p95={s['p95']:.0f}")

VIEWS = ["view-front","view-frontleft","view-left","view-rearleft","view-rear",
         "view-rearright","view-right","view-frontright","view-top",
         "hero-frontleft","hero-rearright","hero-toptilt","close-front","close-roof"]

print("== REGISTRATION AUDIT (fg bbox per pane; ref x<640, proc x>=640) ==")
boxes = {}
for v in VIEWS:
    a = load(v)
    rb = fg_bbox(a, 0, 640)
    pb = fg_bbox(a, 640, 1280)
    boxes[v] = (rb, pb)
    rw, rh = rb[2]-rb[0], rb[3]-rb[1]
    pw, ph = pb[2]-pb[0], pb[3]-pb[1]
    print(f"{v:16s} ref ({rb[0]},{rb[1]})-({rb[2]},{rb[3]}) {rw}x{rh} | "
          f"proc ({pb[0]-640},{pb[1]})-({pb[2]-640},{pb[3]}) {pw}x{ph} | dW {pw-rw:+d} dH {ph-rh:+d}")

print("\n== WARM-PIXEL (salmon) CENSUS, proc pane, R-G>=6 / strong >=18 ==")
for v in VIEWS:
    a = load(v)
    w = warm_census(a, 640, 1280)
    line = f"{v:16s} warm {w['n']}/{w['total']}"
    if w['n']:
        line += f" bbox {w['bbox']} strong {w.get('strong',0)}"
        if w.get('strong'): line += f" strong_bbox {w['strong_bbox']}"
    print(line)

print("\n== WARM CENSUS ref panes (baseline for what warm is legit) ==")
for v in ["view-left","view-rear","close-front"]:
    a = load(v)
    w = warm_census(a, 0, 640)
    print(f"{v:16s} ref warm {w['n']}/{w['total']} strong {w.get('strong',0)}")

print("\n== ENCLOSED-AIR flood census (holes / sky-through), both panes ==")
for v in ["view-top","hero-toptilt","view-front","view-rear","view-left","view-right","close-roof"]:
    a = load(v)
    er = enclosed_air(a, 0, 640)
    ep = enclosed_air(a, 640, 1280)
    print(f"{v:16s} ref enclosed {er['n']}  proc enclosed {ep['n']}")
    for tag, e in (("ref", er), ("proc", ep)):
        for c in e.get("clusters", [])[:5]:
            if c[0] >= 12:
                print(f"    {tag} cluster {c[0]}px ({c[1]},{c[2]})-({c[3]},{c[4]})")

print("\n== CLAIM RECTS (builder's absolute coords, re-measured) ==")
a = load("view-left")
print("view-left trackband proc (700,352)-(1120,392):", fmt(rect_stats(a,700,352,1120,392)))
print("view-left trackband ref  (60,352)-(480,388):  ", fmt(rect_stats(a,60,352,480,388)))

print("\n== view-rear rear-plate field (bbox-anchored) ==")
a = load("view-rear")
rb, pb = boxes["view-rear"]
# rear plate band: central 60% width, rows between turret bottom & mudflap top.
def rel_rect(b, fx0, fy0, fx1, fy1):
    w = b[2]-b[0]; h = b[3]-b[1]
    return (int(b[0]+fx0*w), int(b[1]+fy0*h), int(b[0]+fx1*w), int(b[1]+fy1*h))
rr = rel_rect(rb, 0.30, 0.55, 0.70, 0.78)
pr = rel_rect(pb, 0.30, 0.55, 0.70, 0.78)
print(f"ref rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rect {pr}:", fmt(rect_stats(a, *pr)))

print("\n== view-front lower band (wheel corridors / wrap) ==")
a = load("view-front")
rb, pb = boxes["view-front"]
rr = rel_rect(rb, 0.08, 0.62, 0.92, 0.80)
pr = rel_rect(pb, 0.08, 0.62, 0.92, 0.80)
print(f"ref rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rect {pr}:", fmt(rect_stats(a, *pr)))

print("\n== view-left skirt band sd (mid-hull rows) ==")
a = load("view-left")
rb, pb = boxes["view-left"]
rr = rel_rect(rb, 0.12, 0.55, 0.80, 0.72)
pr = rel_rect(pb, 0.12, 0.55, 0.80, 0.72)
print(f"ref rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rect {pr}:", fmt(rect_stats(a, *pr)))

print("\n== view-left bustle zone (rack region rows) ==")
rr = rel_rect(rb, 0.02, 0.18, 0.22, 0.42)
pr = rel_rect(pb, 0.02, 0.18, 0.22, 0.42)
print(f"ref rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rect {pr}:", fmt(rect_stats(a, *pr)))

print("\n== GLACIS PROFILE (view-left top silhouette, bow third) ==")
for pane, x0, x1 in (("ref", 0, 640), ("proc", 640, 1280)):
    b = boxes["view-left"][0 if pane=="ref" else 1]
    a2 = load("view-left")
    # bow = right side (gun exits right); hull bow region: last 18% of body cols
    # exclude gun tube: gun rides high; take profile then report rows
    xa = int(b[0] + 0.70*(b[2]-b[0])); xb = b[2]
    prof = top_profile(a2, x0, x1, xa, xb)
    xs = sorted(prof)
    rows = [prof[x] for x in xs]
    print(f"{pane}: cols {xa}..{xb} first-fg-rows: min {min(rows)} max {max(rows)}")
    # print sampled every 8 cols
    samp = ", ".join(f"{x}:{prof[x]}" for x in xs[::12])
    print("   ", samp)

print("\n== view-top track flank luma (link read from above) ==")
a = load("view-top")
rb, pb = boxes["view-top"]
# flanks: outer 8% strips, middle 60% length
rrL = rel_rect(rb, 0.0, 0.25, 0.09, 0.75); rrR = rel_rect(rb, 0.91, 0.25, 1.0, 0.75)
prL = rel_rect(pb, 0.0, 0.25, 0.09, 0.75); prR = rel_rect(pb, 0.91, 0.25, 1.0, 0.75)
print("ref L :", fmt(rect_stats(a, *rrL)), " R:", fmt(rect_stats(a, *rrR)))
print("proc L:", fmt(rect_stats(a, *prL)), " R:", fmt(rect_stats(a, *prR)))
