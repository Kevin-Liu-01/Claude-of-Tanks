#!/usr/bin/env python3
# TEMP (isu152 r4 independent critic): claim verification battery on the fresh
# official pairs. ITU-601 luma; bg discriminator |px-(0x15,0x1b,0x20)| maxch<=13.
# Deleted after the round.
import json
from PIL import Image

BG = (0x15, 0x1B, 0x20)
SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-isu152"

def luma(p): return 0.299*p[0] + 0.587*p[1] + 0.114*p[2]
def is_bg(p): return abs(p[0]-BG[0]) <= 13 and abs(p[1]-BG[1]) <= 13 and abs(p[2]-BG[2]) <= 13

def load(view):
    return Image.open(f"{SHOTS}/{view}.png").convert("RGB").load()

def rect_stats(px, x0, x1, y0, y1, xoff=0):
    """stats over [x0,x1)x[y0,y1) local coords; xoff 0=ref pane, 640=proc pane"""
    lum, n_bg = [], 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = px[x+xoff, y]
            if is_bg(p): n_bg += 1
            else: lum.append(luma(p))
    lum.sort()
    def pct(q):
        return round(lum[min(len(lum)-1, int(len(lum)*q))], 1) if lum else None
    tot = (x1-x0)*(y1-y0)
    return {"n": len(lum), "sky%": round(100.0*n_bg/tot, 1),
            "p05": pct(0.05), "p25": pct(0.25), "p50": pct(0.50),
            "p75": pct(0.75), "p95": pct(0.95),
            "dark%<70": round(100.0*sum(1 for v in lum if v < 70)/max(1, len(lum)), 1),
            "iqr": round((pct(0.75) or 0)-(pct(0.25) or 0), 1) if lum else None}

print("=== view-left: DShK muzzle-break pattern, cols z1.185..1.30 -> x322..329 local (probe x314..336) ===")
px = load("view-left")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    print(f"-- {pane} --")
    total_gun_above, total_sky_under, cols_with_pattern = 0, 0, 0
    for x in range(314, 337):
        runs = []  # (type, len) from y=40 down to y=420
        cur, cnt = None, 0
        for y in range(40, 420):
            p = px[x+xoff, y]
            t = "sky" if is_bg(p) else "px"
            if t == cur: cnt += 1
            else:
                if cur is not None: runs.append((cur, cnt))
                cur, cnt = t, 1
        runs.append((cur, cnt))
        # pattern: sky, gun(px), sky, roof(px...)
        if len(runs) >= 4 and runs[0][0] == "sky" and runs[1][0] == "px" and runs[2][0] == "sky":
            gun, skyu = runs[1][1], runs[2][1]
            cols_with_pattern += 1
            total_gun_above += gun
            total_sky_under += skyu
            print(f"  x{x}: [sky {runs[0][1]}][GUN {gun}][sky {skyu}][{runs[3][0]} {runs[3][1]}...]")
    print(f"  {pane} summary: cols with [sky][gun][sky][roof] = {cols_with_pattern}, "
          f"gun px above = {total_gun_above}, sky px under = {total_sky_under}")

print()
print("=== view-left: ground line row y398 + y397 + y396 (proc) vs ref ===")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    for y in (396, 397, 398, 399):
        lum = []
        for x in range(40, 600):
            p = px[x+xoff, y]
            if not is_bg(p): lum.append(luma(p))
        lum.sort()
        if lum:
            p50 = lum[len(lum)//2]
            dark = 100.0*sum(1 for v in lum if v < 70)/len(lum)
            print(f"  {pane} y{y}: n {len(lum)}, p50 {p50:.1f}, dark%<70 {dark:.1f}")
        else:
            print(f"  {pane} y{y}: empty")

print()
print("=== view-left: window band rect x150-262 y366-384 (r3: proc 7.0% vs ref 26.8% sky) ===")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    print(f"  {pane} w2-w3 band:", rect_stats(px, 150, 262, 366, 384, xoff))
print("  whole gap band x60-500 y366-384:")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    print(f"  {pane}:", rect_stats(px, 60, 500, 366, 384, xoff))

print()
print("=== view-left: top profile (median column top y per 20px bucket, x46..594) ===")
def top_profile(px, xoff):
    tops = {}
    for x in range(46, 595):
        t = None
        for y in range(40, 410):
            if not is_bg(px[x+xoff, y]): t = y; break
        tops[x] = t
    return tops
rt, pt = top_profile(px, 0), top_profile(px, 640)
buckets = []
for b0 in range(46, 595, 20):
    xs = [x for x in range(b0, min(595, b0+20))]
    rv = sorted(rt[x] for x in xs if rt[x] is not None)
    pv = sorted(pt[x] for x in xs if pt[x] is not None)
    r = rv[len(rv)//2] if rv else None
    p = pv[len(pv)//2] if pv else None
    buckets.append((b0, r, p, (p-r) if (r and p) else None))
print("  x0  refTop procTop  proc-ref")
for b0, r, p, d in buckets:
    print(f"  {b0:4d} {r} {p} {d}")

print()
print("=== view-top: full-width dark bars in deck-board zone ===")
px2 = load("view-top")
# hull local x-span: ref 227..412, proc 228..411; center ~320
for pane, xoff, hx0, hx1 in [("REF", 0, 227, 413), ("PROC", 640, 228, 412)]:
    bars, cur = [], None
    for y in range(150, 240):
        dark_xs = []
        for x in range(hx0, hx1):
            p = px2[x+xoff, y]
            if not is_bg(p) and luma(p) < 60: dark_xs.append(x)
        # contiguous run through center?
        span = 0
        if dark_xs:
            runs, s, prev = [], dark_xs[0], dark_xs[0]
            for x in dark_xs[1:]:
                if x - prev > 3: runs.append((s, prev)); s = x
                prev = x
            runs.append((s, prev))
            cx = (hx0+hx1)//2
            for a, b in runs:
                if a <= cx <= b: span = b-a+1
    # merge into bars
        wide = span > 0.5*(hx1-hx0)
        if wide and cur is None: cur = y
        if not wide and cur is not None: bars.append((cur, y-1)); cur = None
    if cur is not None: bars.append((cur, 239))
    print(f"  {pane}: full-width dark bars (rows y150-239, >50% hull, crossing center): {len(bars)} {bars}")

print()
print("=== view-top: intake grid cell fields (proc claim: cells q0.38 p05 14.3) ===")
# proc grids eyeballed at x895-925 & x995-1025 abs, y168-218 -> local 255-285 / 355-385
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    print(f"  {pane} gridL x250-290 y160-225:", rect_stats(px2, 250, 290, 160, 225, xoff))
    print(f"  {pane} gridR x350-385 y160-225:", rect_stats(px2, 350, 385, 160, 225, xoff))

print()
print("=== view-top: crate lid zone y95-148 (donut throat + bright covers) ===")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    print(f"  {pane} crate zone x240-400 y95-148:", rect_stats(px2, 240, 400, 95, 148, xoff))

print()
print("=== view-rear: crest width profile (silhouette rows) ===")
px3 = load("view-rear")
for pane, xoff in [("REF", 0), ("PROC", 640)]:
    prof = []
    for y in (110, 120, 130, 140, 150, 170, 190, 210, 230):
        xs = [x for x in range(0, 640) if not is_bg(px3[x+xoff, y])]
        prof.append((y, (max(xs)-min(xs)+1) if xs else 0))
    print(f"  {pane}: {prof}")

print()
print("=== close-roof: receiver/gun zone stats (proc) ===")
px4 = load("close-roof")
# DShK cluster eyeballed near proc x940-1040 y280-330 abs -> local 300-400 y280-330
print("  proc DShK zone x290-410 y270-340:", rect_stats(px4, 290, 410, 270, 340, 640))
print("  ref same zone:", rect_stats(px4, 290, 410, 270, 340, 0))
