#!/usr/bin/env python3
# TEMP independent-critic measurement rig for m1a2 visual r4 verdict (post-r5 build round).
# Reads ONLY shots/critic-m1a2/*.png (official pairs, fresh render 2026-08-04 00:57).
# ITU-601 luma; bg discriminator |px-(0x15,0x1b,0x20)| maxch <= 13 (claims law D).
# Enclosed-air census discriminates TRUE holes (d<=1) from dark paint (d 2-13),
# per the r2/r3 convention. Instrument bank honored: TOL13 + d<=1 stated.
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
    fg[:32, :120] = False
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
    enc[:label_mask_rows, :label_mask_cols] = False
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

def top_profile(a, x0, x1):
    """per-column top-y of fg for skyline reads."""
    sub = a[:, x0:x1]
    fg = ~bgmask(sub)
    fg[:32, :120] = False
    h, w = fg.shape
    prof = np.full(w, -1, dtype=int)
    for x in range(w):
        col = np.where(fg[:, x])[0]
        if len(col): prof[x] = col[0]
    return prof

def rows_max(a, x0, y0, x1, y1):
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

print("\n== B2 ENCLOSED-AIR census (TOL13; true holes d<=1 vs paint d2-13) ==")
for v in VIEWS:
    a = load(v)
    er = enclosed_air(a, 0, 640)
    ep = enclosed_air(a, 640, 1280)
    print(f"{v:16s} ref enc {er['n']} (hole {er['true_hole_px']} / paint {er['paint_px']}) | "
          f"proc enc {ep['n']} (hole {ep['true_hole_px']} / paint {ep['paint_px']})")
    for tag, e in (("ref", er), ("proc", ep)):
        for c in e["clusters"][:8]:
            if c[0] >= 12:
                print(f"    {tag} {c[6]} {c[0]}px ({c[1]},{c[2]})-({c[3]},{c[4]}) med_d {c[5]:.1f}")

print("\n== ORDER 1: SKYLINE (per-column top-y profile over turret zone, both panes) ==")
for v in ["view-left","view-right","view-front"]:
    a = load(v)
    rb, pb = boxes[v]
    rprof = top_profile(a, 0, 640)
    pprof = top_profile(a, 640, 1280)
    # quantize skyline into steps: report notch runs where top-y >= plateau+5
    def lanes(prof, bx0, bx1, label):
        seg = prof[bx0:bx1]
        valid = seg[seg >= 0]
        if len(valid) == 0: return
        plateau = np.percentile(valid, 20)  # high skyline reference (small y = high)
        runs = []
        in_run = False
        for i, ty in enumerate(seg):
            deep = ty >= 0 and (ty - plateau) >= 8
            if deep and not in_run:
                start = i; in_run = True
            elif not deep and in_run:
                runs.append((bx0+start, bx0+i-1, int(seg[start:i].max()-plateau)))
                in_run = False
        if in_run: runs.append((bx0+start, bx0+len(seg)-1, int(seg[start:].max()-plateau)))
        runs = [r for r in runs if r[1]-r[0] >= 3]
        print(f"  {label} plateau_y~{plateau:.0f} notch-runs(>=8px deep, >=4px wide): {len(runs)} {runs[:12]}")
    lanes(rprof, rb[0], rb[2], f"{v} ref ")
    lanes(pprof, pb[0]-640+640, pb[2]-640+640, f"{v} proc")

print("\n== ORDER 4: view-top sun-flank strips (r3 windows: outer 9%, rows 25-75%) ==")
a = load("view-top")
rb, pb = boxes["view-top"]
def rel_rect(b, fx0, fy0, fx1, fy1):
    w = b[2]-b[0]; h = b[3]-b[1]
    return (int(b[0]+fx0*w), int(b[1]+fy0*h), int(b[0]+fx1*w), int(b[1]+fy1*h))
rrL = rel_rect(rb, 0.0, 0.25, 0.09, 0.75); rrR = rel_rect(rb, 0.91, 0.25, 1.0, 0.75)
prL = rel_rect(pb, 0.0, 0.25, 0.09, 0.75); prR = rel_rect(pb, 0.91, 0.25, 1.0, 0.75)
print("ref  L:", fmt(rect_stats(a, *rrL)), " R:", fmt(rect_stats(a, *rrR)))
print("proc L:", fmt(rect_stats(a, *prL)), " R:", fmt(rect_stats(a, *prR)))

print("\n== ORDER 6: roof-mid rect (r3 window proc (880,220)-(1040,330), ref (240,220)-(400,330)) ==")
print("proc:", fmt(rect_stats(a,880,220,1040,330)))
print("ref: ", fmt(rect_stats(a,240,220,400,330)))
print("saddle proc (916,170)-(986,217):", fmt(rect_stats(a,916,170,986,217)))
print("saddle ref  (276,170)-(346,217):", fmt(rect_stats(a,276,170,346,217)))

print("\n== ORDER 5: rear-rack duffel read from plan (top pane rows ~bbox-top..+90) ==")
# rear = top of image (gun points down). scan rows 8%..20% of bbox for round pale masses
rr = rel_rect(rb, 0.10, 0.055, 0.90, 0.20)
pr = rel_rect(pb, 0.10, 0.055, 0.90, 0.20)
print(f"ref rack rect {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc rack rect {pr}:", fmt(rect_stats(a, *pr)))
# per-column mean luma across the rack rows: duffel trio should give 3 bright lobes
def col_profile(a, x0, y0, x1, y1):
    sub = a[y0:y1, x0:x1]
    L = luma(sub); m = ~bgmask(sub)
    out = []
    for j in range(L.shape[1]):
        vals = L[:, j][m[:, j]]
        out.append(round(float(vals.mean()),1) if len(vals) else 0.0)
    return out
cp = col_profile(a, *pr)
cr = col_profile(a, *rr)
print("proc col-mean luma across rack (lobe hunt):", [int(v) for v in cp[::4]])
print("ref  col-mean luma across rack:            ", [int(v) for v in cr[::4]])

print("\n== ORDER 7: rear lower wedge (verdict rect (849,419)-(1056,440) + full rows 419-440) ==")
a = load("view-rear")
s = rect_stats(a,849,419,1056,440)
print("proc verdict rect:", fmt(s))
sub = a[419:440, 849:1056]; L = luma(sub); m = ~bgmask(sub)
print("  proc >=L75 px in verdict rect:", int((L[m] >= 75).sum()) if m.any() else 0)
rb2, pb2 = boxes["view-rear"]
pfull = rect_stats(a, pb2[0]-0, 419, pb2[2], 440)
print("proc full-x rows 419-440:", fmt(pfull))
# ref rows: mirror via bbox fractions — ref bbox
rfull = rect_stats(a, rb2[0], 419, rb2[2], 440)
print("ref  full-x rows 419-440:", fmt(rfull))
sub = a[419:440, rb2[0]:rb2[2]]; L = luma(sub); m = ~bgmask(sub)
print("  ref >=L75 px:", int((L[m] >= 75).sum()) if m.any() else 0)

print("\n== ORDER 7b: rear plate rect (r3 window, rel 0.30-0.70 x 0.55-0.78) ==")
rr = rel_rect(rb2, 0.30, 0.55, 0.70, 0.78)
pr = rel_rect(pb2, 0.30, 0.55, 0.70, 0.78)
print(f"ref {rr}: ", fmt(rect_stats(a, *rr)))
print(f"proc {pr}:", fmt(rect_stats(a, *pr)))

print("\n== GLACIS regression (r3: proc 55.4 vs ref 53.4) ==")
a = load("view-front")
print("proc (820,340)-(1100,430):", fmt(rect_stats(a,820,340,1100,430)))
print("ref  (180,340)-(460,430): ", fmt(rect_stats(a,180,340,460,430)))

print("\n== BANKED trackband regression (view-left; r3: proc 52.6/8.1 vs ref 56.0/7.3) ==")
a = load("view-left")
print("proc (700,352)-(1120,392):", fmt(rect_stats(a,700,352,1120,392)))
print("ref  (60,352)-(480,388):  ", fmt(rect_stats(a,60,352,480,388)))

print("\n== WARM-PIXEL (salmon) census, proc panes ==")
for v in ["view-left","view-rear","close-front","view-top","view-right"]:
    a = load(v)
    sub = a[:, 640:1280].astype(np.int16)
    fg = ~bgmask(a[:, 640:1280])
    fg[:32, :120] = False
    strong = (sub[...,0] - sub[...,1] >= 18) & fg
    print(f"{v:16s} strong-warm px: {int(strong.sum())}")
