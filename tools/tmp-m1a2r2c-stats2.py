#!/usr/bin/env python3
# TEMP critic batch 2: glacis anchor, moire, camo patch size, slat metrics,
# turret band profile, works-field top luma, whip check. Official pairs only.
from PIL import Image
import numpy as np

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)

def load(name):
    return np.asarray(Image.open(f"{SHOTS}/{name}.png").convert("RGB"), dtype=np.uint8)

def bgmask(a): return (np.abs(a.astype(np.int16) - BG).max(axis=2) <= 13)
def luma(a):
    f = a.astype(np.float64)
    return 0.299*f[...,0] + 0.587*f[...,1] + 0.114*f[...,2]

def rect(a, x0, y0, x1, y1):
    L = luma(a[y0:y1, x0:x1]); m = ~bgmask(a[y0:y1, x0:x1])
    v = L[m]
    return v

def stats(v):
    if len(v)==0: return "EMPTY"
    return f"n={len(v)} L={v.mean():.1f} sd={v.std():.1f} p05={np.percentile(v,5):.0f} p50={np.percentile(v,50):.0f} p95={np.percentile(v,95):.0f}"

print("== VIEW-FRONT GLACIS ANCHOR (center band between fenders, below turret) ==")
a = load("view-front")
# ref hull band rows ~330-430 center x180-460; proc rows ~335-430 center x820-1100
print("ref glacis (180,335,460,425): ", stats(rect(a,180,335,460,425)))
print("proc glacis (820,340,1100,430):", stats(rect(a,820,340,1100,430)))

print("\n== CLOSE-FRONT CHEEK MOIRE (horiz high-freq energy) ==")
a = load("close-front")
def hf_energy(x0,y0,x1,y1):
    L = luma(a[y0:y1, x0:x1])
    d = np.abs(np.diff(L, axis=1))
    # alternation: fraction of adjacent-diff sign flips with amplitude>6
    dd = np.diff(L, axis=1)
    flips = ((dd[:, :-1] * dd[:, 1:]) < 0) & (np.abs(dd[:, :-1]) > 6) & (np.abs(dd[:, 1:]) > 6)
    return f"mean|d| {d.mean():.2f}  flip% {100*flips.mean():.2f}"
# proc cheeks left/right of the portal (avoid seams): sample two rects
print("proc cheek L (800,240)-(920,330):", hf_energy(800,240,920,330))
print("proc cheek R (1050,240)-(1130,330):", hf_energy(1050,240,1130,330))
print("ref cheek L (60,250)-(200,330):  ", hf_energy(60,250,200,330))
print("ref cheek R (300,250)-(430,330): ", hf_energy(300,250,430,330))

print("\n== CAMO PATCH SIZE (view-left hull band, pale mask L>74, largest blob) ==")
a = load("view-left")
def patch(x0,y0,x1,y1,tag):
    sub = a[y0:y1, x0:x1]
    L = luma(sub); m = (~bgmask(sub)) & (L > 74)
    from scipy import ndimage
    lab, k = ndimage.label(m)
    if k == 0: print(tag, "no pale patches"); return
    sizes = ndimage.sum(m, lab, range(1, k+1))
    order = np.argsort(sizes)[::-1]
    tot = m.sum()
    top3 = [int(sizes[i]) for i in order[:3]]
    print(f"{tag} pale px {int(tot)} largest blobs {top3} (of rect {((x1-x0)*(y1-y0))})")
patch(110,300,480,350,"ref skirt band: ")
patch(750,303,1120,353,"proc skirt band:")

print("\n== REAR GRILLE SLAT METRICS (view-rear, left door field) ==")
a = load("view-rear")
def slats(x0,y0,x1,y1,tag):
    L = luma(a[y0:y1, x0:x1])
    rows = L.mean(axis=1)
    bed = np.percentile(rows, 25)
    peaks = 0; inpk = False
    for r in rows:
        if r > bed + 8 and not inpk: peaks += 1; inpk = True
        elif r <= bed + 8: inpk = False
    print(f"{tag} rows {y0}-{y1}: bed(L25) {bed:.1f} rowmax {rows.max():.1f} bright-slat rows(peaks) {peaks}")
slats(851,360,995,420,"proc L grille")
slats(1100,360,1180,420,"proc R grille")
slats(196,355,320,430,"ref  L grille")
slats(380,355,500,430,"ref  R grille")

print("\n== TURRET BAND WIDTH PROFILE (view-front, rows 140-340, step 10) ==")
a = load("view-front")
fg = ~bgmask(a)
fg[:32,:120] = False
for y in range(140, 341, 10):
    r = fg[y, :640]; p = fg[y, 640:]
    rw = int(r.sum()); pw = int(p.sum())
    print(f"y{y}: ref {rw:3d}px  proc {pw:3d}px  d {pw-rw:+d}")

print("\n== WORKS-FIELD / SADDLE TOP-DOWN LUMA (view-top, same station both panes) ==")
a = load("view-top")
# station z -1.77..-0.93 -> y 170..217; hull width center
print("ref  (240,170,400,217):", stats(rect(a,240,170,400,217)))
print("proc (880,170,1040,217):", stats(rect(a,880,170,1040,217)))
print("ref  full roof (240,220,400,330):", stats(rect(a,240,220,400,330)))
print("proc full roof (880,220,1040,330):", stats(rect(a,880,220,1040,330)))

print("\n== WHIP CHECK (thin fittings above y<240 in side views) ==")
for v in ["view-left","view-right"]:
    a = load(v)
    fg = ~bgmask(a); fg[:32,:120] = False
    for tag, sl in (("ref", slice(0,640)), ("proc", slice(640,1280))):
        band = fg[120:245, sl]
        cols = np.where(band.any(axis=0))[0]
        n = len(cols)
        print(f"{v} {tag}: cols with fg above the roof band (y120-245): {n}")
