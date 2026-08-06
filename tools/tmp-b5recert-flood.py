#!/usr/bin/env python3
# TEMP (m1a2 §B5 re-cert critic): §B2 enclosed-air census on the fresh official
# pairs, with the CURRENT §D sky test: bg |px-(0x15,0x1b,0x20)| maxch <= 13
# AND blue-signature B-R >= +8 (revolution-r7 law, BUILD-STANDARD §D).
# TRUE holes = enclosed clusters with median bg-distance d <= 1; d 2-13 = paint.
# Reads ONLY shots/critic-m1a2/*.png. Proc pane x 640..1280, ref pane 0..640.
import numpy as np
from PIL import Image

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)
TOL = 13

VIEWS = ["view-front","view-frontleft","view-left","view-rearleft","view-rear",
         "view-rearright","view-right","view-frontright","view-top",
         "hero-frontleft","hero-rearright","hero-toptilt","close-front","close-roof"]

def census(a, x0, x1):
    pane = a[:, x0:x1].astype(np.int16)
    d = np.abs(pane - BG).max(axis=2)
    bsig = (pane[..., 2] - pane[..., 0]) >= 8      # B-R >= +8 (blue signature)
    sky = (d <= TOL) & bsig
    h, w = sky.shape
    seen = np.zeros_like(sky, dtype=bool)
    stack = []
    for x in range(w):
        if sky[0, x]: stack.append((0, x))
        if sky[h-1, x]: stack.append((h-1, x))
    for y in range(h):
        if sky[y, 0]: stack.append((y, 0))
        if sky[y, w-1]: stack.append((y, w-1))
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not sky[y, x]: continue
        xl = x
        while xl > 0 and sky[y, xl-1] and not seen[y, xl-1]: xl -= 1
        xr = x
        while xr < w-1 and sky[y, xr+1] and not seen[y, xr+1]: xr += 1
        seen[y, xl:xr+1] = True
        for yy in (y-1, y+1):
            if 0 <= yy < h:
                xx = xl
                while xx <= xr:
                    if sky[yy, xx] and not seen[yy, xx]:
                        stack.append((yy, xx))
                        while xx <= xr and sky[yy, xx]: xx += 1
                    else:
                        xx += 1
    enc = sky & ~seen
    enc[:32, :120] = False   # pane label
    n = int(enc.sum())
    true_px = 0
    clusters = []
    if n:
        seen2 = np.zeros_like(enc, dtype=bool)
        ys0, xs0 = np.where(enc)
        for sy, sx in zip(ys0, xs0):
            if seen2[sy, sx]: continue
            stk = [(sy, sx)]; seen2[sy, sx] = True; pix = []
            while stk:
                y, x = stk.pop()
                pix.append((y, x))
                for yy, xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                    if 0 <= yy < h and 0 <= xx < w and enc[yy, xx] and not seen2[yy, xx]:
                        seen2[yy, xx] = True; stk.append((yy, xx))
            ys = np.array([p[0] for p in pix]); xs = np.array([p[1] for p in pix])
            med = float(np.median(d[ys, xs]))
            if med <= 1: true_px += len(pix)
            if len(pix) >= 6:
                clusters.append((len(pix), int(xs.min())+x0, int(ys.min()),
                                 int(xs.max())+x0, int(ys.max()), med,
                                 "TRUE" if med <= 1 else "paint"))
    clusters.sort(key=lambda c: -c[0])
    return n, true_px, clusters[:4]

for v in VIEWS:
    a = np.asarray(Image.open(f"{SHOTS}/{v}.png").convert("RGB"), dtype=np.uint8)
    w = a.shape[1]
    rn, rt, rc = census(a, 0, w//2)
    pn, pt, pc = census(a, w//2, w)
    line = f"{v:16s} proc enc {pn:5d} true {pt:4d} | ref enc {rn:5d} true {rt:4d}"
    if pc: line += "  proc-clusters " + "; ".join(f"{c[0]}px({c[6]},d{c[5]:.0f})@({c[1]},{c[2]})-({c[3]},{c[4]})" for c in pc)
    print(line)
