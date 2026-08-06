#!/usr/bin/env python3
# TEMP (isu152 r4 independent critic): precision batch 2. Deleted after round.
from PIL import Image

BG = (0x15, 0x1B, 0x20)
SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-isu152"
def luma(p): return 0.299*p[0] + 0.587*p[1] + 0.114*p[2]
def is_bg(p): return abs(p[0]-BG[0]) <= 13 and abs(p[1]-BG[1]) <= 13 and abs(p[2]-BG[2]) <= 13
def load(v): return Image.open(f"{SHOTS}/{v}.png").convert("RGB").load()

def rect(px, x0, x1, y0, y1, xoff=0, label=""):
    lum, rs, gs, bs, nbg = [], 0, 0, 0, 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = px[x+xoff, y]
            if is_bg(p): nbg += 1; continue
            lum.append(luma(p)); rs += p[0]; gs += p[1]; bs += p[2]
    lum.sort()
    n = len(lum)
    if n == 0:
        print(f"  {label}: all bg"); return
    p50 = lum[n//2]
    print(f"  {label}: n {n} sky% {100.0*nbg/((x1-x0)*(y1-y0)):.1f} "
          f"p50 {p50:.1f} p05 {lum[int(n*0.05)]:.1f} p95 {lum[min(n-1,int(n*0.95))]:.1f} "
          f"meanRGB ({rs/n:.0f},{gs/n:.0f},{bs/n:.0f}) B/G {bs/max(1,gs):.3f}")

print("=== view-top: crate-lid vent donut mirror rects (claim throat p50 93.9-95.8) ===")
px = load("view-top")
rect(px, 292, 308, 68, 84, 640, "PROC donut L (292-308,68-84)")
rect(px, 328, 344, 68, 84, 640, "PROC donut R (328-344,68-84)")
rect(px, 296, 304, 72, 80, 640, "PROC donut L throat core")
rect(px, 332, 340, 72, 80, 640, "PROC donut R throat core")
rect(px, 292, 308, 68, 84, 0, "REF same zone L")
rect(px, 328, 344, 68, 84, 0, "REF same zone R")
print("  crate central ring cover:")
rect(px, 295, 315, 98, 118, 640, "PROC central ring (295-315,98-118)")
print("  ref twin bright covers (eyeball loc):")
rect(px, 270, 300, 95, 125, 0, "REF cover L")
rect(px, 315, 345, 95, 125, 0, "REF cover R")
print("  casemate-roof L-cupola dark core (proc, eyeball (285,325)):")
rect(px, 278, 292, 318, 332, 640, "PROC L-cupola core")
rect(px, 262, 308, 302, 348, 640, "PROC L-cupola whole")

print()
print("=== hue check: suspected blue periscope glass ===")
px2 = load("close-front")
rect(px2, 160, 170, 228, 236, 640, "close-front proc glass 1 (160-170,228-236)")
rect(px2, 274, 286, 228, 238, 640, "close-front proc glass 2 (274-286,228-238)")
rect(px2, 100, 460, 200, 380, 640, "close-front proc whole-face (context)")
rect(px2, 100, 460, 200, 380, 0, "close-front ref whole-face (context)")
px3 = load("close-roof")
rect(px3, 155, 175, 295, 320, 640, "close-roof proc small blue rects zone")

print()
print("=== close-roof: what content sits at y<212 (proc)? ===")
px3p = px3
for y in (196, 200, 204, 208):
    xs = [x for x in range(0, 640) if not is_bg(px3p[x+640, y])]
    if xs:
        runs, s, prev = [], xs[0], xs[0]
        for x in xs[1:]:
            if x-prev > 4: runs.append((s, prev)); s = x
            prev = x
        runs.append((s, prev))
        print(f"  proc y{y}: runs {runs}")
    else:
        print(f"  proc y{y}: empty")
for y in (212, 216, 220):
    xs = [x for x in range(0, 640) if not is_bg(px3p[x, y])]
    if xs:
        runs, s, prev = [], xs[0], xs[0]
        for x in xs[1:]:
            if x-prev > 4: runs.append((s, prev)); s = x
            prev = x
        runs.append((s, prev))
        print(f"  ref  y{y}: runs {runs}")

print()
print("=== view-front: DShK cluster above crest? cols x840-880 abs (proc local 200-240) ===")
px4 = load("view-front")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    # crest line: find content top in x180-320 local
    tops = {}
    for x in range(150, 460):
        t = None
        for y in range(60, 300):
            if not is_bg(px4[x+xoff, y]): t = y; break
        tops[x] = t
    # summarize buckets of 20
    prof = []
    for b in range(150, 460, 31):
        vals = sorted(tops[x] for x in range(b, min(460, b+31)) if tops[x])
        prof.append((b, vals[len(vals)//2] if vals else None))
    print(f"  {pane} top profile x150-460: {prof}")

print()
print("=== view-rear: crest width ratio rows y105-145 fine ===")
px5 = load("view-rear")
for y in range(104, 150, 4):
    r = [x for x in range(0, 640) if not is_bg(px5[x, y])]
    p = [x for x in range(0, 640) if not is_bg(px5[x+640, y])]
    rw = (max(r)-min(r)+1) if r else 0
    pw = (max(p)-min(p)+1) if p else 0
    print(f"  y{y}: ref {rw} proc {pw} ratio {pw/max(1,rw):.2f}")
