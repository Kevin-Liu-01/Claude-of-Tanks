#!/usr/bin/env python3
# TEMP independent-critic measurement rig for m1a2 visual r3 (shaded-parity r3 verdict).
# Reads ONLY shots/critic-m1a2/*.png (official pairs, fresh render 2026-08-03 16:06).
# ITU-601 luma; bg discriminator |px-(0x15,0x1b,0x20)| maxch <= 13 (claims law D).
# Enclosed-air census discriminates TRUE holes (d<=1, exact clear color) from
# dark paint (d 2-13) per the r2 convention.
import sys
from PIL import Image
import numpy as np

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)
TOL = 13

def load(name):
    im = Image.open(f"{SHOTS}/{name}.png").convert("RGB")
    return np.asarray(im, dtype=np.uint8)

def bgdist(a):
    return np.abs(a.astype(np.int16) - BG).max(axis=2)

def bgmask(a):
    return bgdist(a) <= TOL

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

def fmt(s):
    if s.get("n", 0) == 0: return "EMPTY"
    return (f"n={s['n']} L={s['mean']:.1f} sd={s['sd']:.1f} "
            f"p05={s['p05']:.0f} p50={s['p50']:.0f} p95={s['p95']:.0f}")

def label_components(mask):
    """pure-numpy 4-connected labeling via iterative BFS. Returns list of
    (npx, x0, y0, x1, y1, ys, xs) per component."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    idx_ys, idx_xs = np.where(mask)
    for sy, sx in zip(idx_ys, idx_xs):
        if seen[sy, sx]: continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        pix = []
        while stack:
            y, x = stack.pop()
            pix.append((y, x))
            for yy, xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy,xx] and not seen[yy,xx]:
                    seen[yy,xx] = True
                    stack.append((yy,xx))
        ys = np.array([p[0] for p in pix]); xs = np.array([p[1] for p in pix])
        comps.append((len(pix), int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), ys, xs))
    comps.sort(key=lambda c: -c[0])
    return comps

def enclosed_air(a, x0, x1, label_mask_rows=32, label_mask_cols=120):
    """flood fill bg from border of pane; enclosed bg px = holes/sky-through.
    Classifies each enclosed component by its median bg distance:
    d<=1 exact clear color (TRUE hole) vs d>=2 dark paint."""
    pane = a[:, x0:x1]
    sub = bgmask(pane)
    d = bgdist(pane)
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
    enc[:label_mask_rows, :label_mask_cols] = False  # pane label
    n_all = int(enc.sum())
    out = dict(n=n_all, true_hole_px=0, paint_px=0, clusters=[])
    if n_all:
        comps = label_components(enc)
        for c in comps:
            npx, cx0, cy0, cx1, cy1, ys, xs = c
            med_d = float(np.median(d[ys, xs]))
            kind = "TRUE-HOLE" if med_d <= 1 else "paint"
            if med_d <= 1: out["true_hole_px"] += npx
            else: out["paint_px"] += npx
            if npx >= 4:
                out["clusters"].append((npx, cx0 + x0, cy0, cx1 + x0, cy1, med_d, kind))
    return out

def rows_max(a, x0, y0, x1, y1):
    """per-row max luma inside rect (fg only), for slat-ladder scans."""
    sub = a[y0:y1, x0:x1]
    L = luma(sub)
    m = ~bgmask(sub)
    out = []
    for i in range(L.shape[0]):
        vals = L[i][m[i]]
        out.append(float(vals.max()) if len(vals) else 0.0)
    return out

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

print("\n== B2 ENCLOSED-AIR census (true holes d<=1 vs paint d2-13), both panes ==")
for v in ["view-top","hero-toptilt","view-front","view-rear","view-left","view-right","close-roof","hero-rearright","hero-frontleft"]:
    a = load(v)
    er = enclosed_air(a, 0, 640)
    ep = enclosed_air(a, 640, 1280)
    print(f"{v:16s} ref enc {er['n']} (hole {er['true_hole_px']} / paint {er['paint_px']}) | "
          f"proc enc {ep['n']} (hole {ep['true_hole_px']} / paint {ep['paint_px']})")
    for tag, e in (("ref", er), ("proc", ep)):
        for c in e["clusters"][:6]:
            if c[0] >= 12:
                print(f"    {tag} {c[6]} {c[0]}px ({c[1]},{c[2]})-({c[3]},{c[4]}) med_d {c[5]:.1f}")

print("\n== R3 CLAIM RECTS (builder's absolute coords, re-measured) ==")
a = load("view-top")
print("ORDER2 roof rect  proc (880,220)-(1040,330):", fmt(rect_stats(a,880+640-640,220,1040,330)))
# builder coords are pane-absolute in the 1280 image (proc pane starts 640)
print("  [as printed: proc pane coords (880,220)-(1040,330) claim L60.8 p95 71]")
print("ORDER2 roof rect  ref mirror-station:", fmt(rect_stats(a,240,220,400,330)))
print("  [r2 ref value: L62.1 p95 81]")

print("\nORDER3 saddle rect (builder: p05 42 -> 57, L 59-61 vs ref 61.8):")
print("  proc (916,170)-(986,217):", fmt(rect_stats(a,916,170,986,217)))
print("  ref  (276,170)-(346,217):", fmt(rect_stats(a,276,170,346,217)))

print("\nORDER8 top flanks (claims proc sd 6.9/10.8, ref 8.8/16.1):")
rb, pb = boxes["view-top"]
def rel_rect(b, fx0, fy0, fx1, fy1):
    w = b[2]-b[0]; h = b[3]-b[1]
    return (int(b[0]+fx0*w), int(b[1]+fy0*h), int(b[0]+fx1*w), int(b[1]+fy1*h))
rrL = rel_rect(rb, 0.0, 0.25, 0.09, 0.75); rrR = rel_rect(rb, 0.91, 0.25, 1.0, 0.75)
prL = rel_rect(pb, 0.0, 0.25, 0.09, 0.75); prR = rel_rect(pb, 0.91, 0.25, 1.0, 0.75)
print("ref L :", fmt(rect_stats(a, *rrL)), " R:", fmt(rect_stats(a, *rrR)))
print("proc L:", fmt(rect_stats(a, *prL)), " R:", fmt(rect_stats(a, *prR)))

print("\nORDER7 top-view bow parity (claims proc 50.8 vs ref 50.1):")
# bow = gun-down image bottom section of hull before tracks: rows near bottom of bbox
rr = rel_rect(rb, 0.15, 0.80, 0.85, 0.92)
pr = rel_rect(pb, 0.15, 0.80, 0.85, 0.92)
print(f"ref rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rect {pr}:", fmt(rect_stats(a, *pr)))

print("\n== ORDER7 GLACIS view-front rect (claims proc 55.4 vs ref 53.4) ==")
a = load("view-front")
print("proc (820+640? builder wrote (820,340)-(1100,430)):")
print("  proc (820,340)-(1100,430):", fmt(rect_stats(a,820,340,1100,430)))
print("  ref  (180,340)-(460,430): ", fmt(rect_stats(a,180,340,460,430)))

print("\n== ORDER5 REAR PLATE (claims proc 62.7/4.3 vs ref 61.1/4.4) ==")
a = load("view-rear")
rb, pb = boxes["view-rear"]
rr = rel_rect(rb, 0.30, 0.55, 0.70, 0.78)
pr = rel_rect(pb, 0.30, 0.55, 0.70, 0.78)
print(f"ref rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rect {pr}:", fmt(rect_stats(a, *pr)))
print("row-max ladder scan (proc rect rows, max luma/row — bright-slat hunt):")
rmax = rows_max(a, *pr)
peaks = [(pr[1]+i, round(v)) for i, v in enumerate(rmax) if v >= 78]
print(f"  rows >= L78: {len(peaks)}  {peaks[:12]}")
rmax_ref = rows_max(a, *rr)
peaks_ref = [(rr[1]+i, round(v)) for i, v in enumerate(rmax_ref) if v >= 78]
print(f"  ref rows >= L78: {len(peaks_ref)}  {peaks_ref[:12]}")

print("\n== ORDER6 SLIT census near sight band (view-left / view-right) ==")
for v in ["view-left","view-right"]:
    a = load(v)
    er = enclosed_air(a, 0, 640)
    ep = enclosed_air(a, 640, 1280)
    print(f"{v}: ref true-hole px {er['true_hole_px']} | proc true-hole px {ep['true_hole_px']}")
    for tag, e in (("ref", er), ("proc", ep)):
        for c in e["clusters"][:8]:
            if c[6] == "TRUE-HOLE" and c[0] >= 8:
                print(f"    {tag} {c[0]}px ({c[1]},{c[2]})-({c[3]},{c[4]})")

print("\n== BANKED r2 numbers regression (must hold) ==")
a = load("view-left")
print("view-left trackband proc (700,352)-(1120,392):", fmt(rect_stats(a,700,352,1120,392)))
print("view-left trackband ref  (60,352)-(480,388):  ", fmt(rect_stats(a,60,352,480,388)))

print("\n== WARM-PIXEL (salmon) spot check, proc panes ==")
for v in ["view-left","view-rear","close-front","view-top"]:
    a = load(v)
    sub = a[:, 640:1280].astype(np.int16)
    fg = ~bgmask(a[:, 640:1280])
    fg[:32, :120] = False
    strong = (sub[...,0] - sub[...,1] >= 18) & fg
    print(f"{v:16s} strong-warm px: {int(strong.sum())}")
