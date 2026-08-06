# TEMP (uk combined tone round): done-gate window measurement for
# challenger1 + centurion5 + centurion3, reproducing the three critics'
# windows (ITU-601 luma; fg = NOT(bg maxch<=13 AND B-R>=+8) per BUILD-STANDARD
# section D). Reads shots/critic-<id>/*.png pairs (1280x640: REF left half,
# PROC right half). Usage:
#   python3 tools/tmp-uk-tone-measure.py [--dir=shots/critic-challenger1] [ch1|c5|c3|all]
from PIL import Image
import numpy as np
import sys

BG = np.array([0x15, 0x1B, 0x20], float)
BASE = {"ch1": "shots/critic-challenger1", "c5": "shots/critic-centurion5", "c3": "shots/critic-centurion3"}
for a in sys.argv[1:]:
    if a.startswith("--ch1="): BASE["ch1"] = a.split("=", 1)[1]
    if a.startswith("--c5="): BASE["c5"] = a.split("=", 1)[1]
    if a.startswith("--c3="): BASE["c3"] = a.split("=", 1)[1]
WHICH = [a for a in sys.argv[1:] if not a.startswith("--")] or ["all"]

def load(base, view):
    return np.asarray(Image.open(f"{base}/{view}.png").convert("RGB"), float)

def luma(x):
    return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]

def fg_mask(x):
    d = np.abs(x - BG).max(-1)
    blue = (x[..., 2] - x[..., 0]) >= 8
    return ~((d <= 13) & blue)

def win(a, r):  # r = (x0,y0,x1,y1) absolute
    return a[r[1]:r[3], r[0]:r[2]]

def stats(a, r, tag, sub=None, subs=(), want=""):
    x = win(a, r)
    m = fg_mask(x)
    L = luma(x)[m]
    if L.size == 0:
        print(f"{tag:44s} EMPTY fg"); return
    rgb = x[m].mean(0).round(0)
    out = f"{tag:44s} med {np.median(L):5.1f} p5 {np.percentile(L,5):5.1f} p95 {np.percentile(L,95):5.1f} sd {L.std():4.1f} rgb ({int(rgb[0])},{int(rgb[1])},{int(rgb[2])})"
    for s in ((sub,) if sub else ()) + tuple(subs):
        out += f" sub{s} {(L < s).sum()}"
    if want: out += f"   [{want}]"
    print(out)

def air(a, r, tag, want=""):
    x = win(a, r)
    d = np.abs(x - BG).max(-1)
    blue = (x[..., 2] - x[..., 0]) >= 8
    n = ((d <= 13) & blue).sum()
    print(f"{tag:44s} air {n}/{x.shape[0]*x.shape[1]} px ({100*n/(x.shape[0]*x.shape[1]):.1f}%)   [{want}]")

def bluechips(a, r, tag, want=""):
    x = win(a, r)
    m = fg_mask(x)
    L = luma(x)
    blue = ((x[..., 2] - x[..., 0]) >= 12) & (L > 40) & m
    print(f"{tag:44s} blue-signature {blue.sum()} px   [{want}]")

def chip(a, r, tag):
    x = win(a, r)
    rgb = x.reshape(-1, 3).mean(0)
    print(f"{tag:44s} rgb ({rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f}) b-r {rgb[2]-rgb[0]:+.1f}   [want b-r <= 0]")

P = 640  # proc half x-offset

def c3():
    b = BASE["c3"]
    print(f"== centurion3 (Group 1/2 done-gates) [{b}] ==")
    reL = load(b, "view-rear")
    for x0, x1, side in ((72, 178, "L"), (462, 568, "R")):
        stats(reL, (x0 + P, 400, x1 + P, 570), f"1a rear col {side} PROC", subs=(30,), want="med>=40 sub30<=500")
        stats(reL, (x0, 400, x1, 570), f"   rear col {side} REF", subs=(30,))
    cf = load(b, "close-front")
    stats(cf, (0 + P, 330, 640 + P, 478), "1a close-front band PROC", subs=(30,), want="sub30<=800")
    stats(cf, (0, 330, 640, 478), "   close-front band REF", subs=(30,))
    vl = load(b, "view-left")
    stats(vl, (60 + P, 368, 590 + P, 404), "1a left gear band PROC", subs=(30,), want="sub30<=400")
    stats(vl, (60, 368, 590, 404), "   left gear band REF", subs=(30,))
    vf = load(b, "view-front")
    for x0, x1, side in ((72, 178, "L"), (462, 568, "R")):
        stats(vf, (x0 + P, 352, x1 + P, 548), f"1b front col {side} PROC", subs=(30,), want="med>=48 p5>=30")
        stats(vf, (x0, 352, x1, 548), f"   front col {side} REF", subs=(30,))
    for x0, x1, side in ((72, 178, "L"), (462, 568, "R")):
        air(vf, (x0 + P, 352, x1 + P, 548), f"1d front col {side} PROC air", want="<=7%")
        air(vf, (x0, 352, x1, 548), f"   front col {side} REF air")
        air(reL, (x0 + P, 400, x1 + P, 570), f"1d rear col {side} PROC air", want="<=7%")
        air(reL, (x0, 400, x1, 570), f"   rear col {side} REF air")
    vt = load(b, "view-top")
    # deck zones (top view, z runs vertically): front deck upper band, turret
    # plan center, rear deck lower band; x band inside the hull silhouette.
    for (y0, y1, name, wantN) in ((90, 210, "front deck", 1500), (240, 390, "turret plan", 1000), (430, 560, "rear deck", 1600)):
        stats(vt, (230 + P, y0, 410 + P, y1), f"2a top {name} PROC", subs=(38,), want=f"sub38<={wantN} med +3..5L vs ref")
        stats(vt, (230, y0, 410, y1), f"   top {name} REF", subs=(38,))
    cr = load(b, "close-roof")
    stats(cr, (100 + P, 240, 540 + P, 420), "2a close-roof field PROC", subs=(38,), want="sub38<=11000")
    stats(cr, (100, 240, 540, 420), "   close-roof field REF", subs=(38,))
    bluechips(cr, (0 + P, 0, 640 + P, 640), "2b close-roof PROC", want="<=20")
    bluechips(cr, (0, 0, 640, 640), "   close-roof REF")
    stats(reL, (150 + P, 296, 490 + P, 336), "2c rear bin row PROC", subs=(45,), want="med>=55 sub45<=400")
    stats(reL, (150, 296, 490, 336), "   rear bin row REF", subs=(45,))
    stats(vf, (230 + P, 150, 410 + P, 300), "2d front face PROC", subs=(45,), want="med>=50 sub45<=7000")
    stats(vf, (230, 150, 410, 300), "   front face REF", subs=(45,))

def c5():
    b = BASE["c5"]
    print(f"== centurion5 (O1/O2/O4 done-gates) [{b}] ==")
    vl = load(b, "view-left")
    stats(vl, (60, 340, 460, 400), "O1 left REF wheel row")
    stats(vl, (700, 340, 1100, 400), "O1 left PROC same band", want="into ref 26..64 class")
    stats(vl, (720, 378, 1080, 396), "O2 left PROC horn/pad row", want="p5 out of 1..7 class")
    stats(vl, (720, 396, 1080, 408), "O2 left PROC ground pad strip", want="p95 <= ~56 ref class")
    stats(vl, (100, 396, 460, 408), "   left REF ground line")
    vf = load(b, "view-front")
    stats(vf, (733, 345, 822, 470), "O2 front PROC L wrap face", want="ref band 41..64 class")
    stats(vf, (68, 345, 175, 470), "   front REF L band")
    stats(vf, (985, 235, 1030, 290), "O4a front PROC tan hood", want="rgb ~(56,62,47) p95<=73")
    stats(vf, (940, 290, 985, 330), "O4c front PROC muzzle face", want="dark-bore read ~58")
    chip(vf, (906, 141, 919, 155), "O4b chip deck L")
    chip(vf, (1018, 156, 1031, 172), "O4b chip deck R")
    cr = load(b, "close-roof")
    chip(cr, (1066, 303, 1078, 316), "O4b chip close-roof")

def ch1():
    b = BASE["ch1"]
    print(f"== challenger1 (O1/O2/O4 done-gates) [{b}] ==")
    vl = load(b, "view-left")
    stats(vl, (210, 360, 370, 390), "O1 left REF wheel band")
    stats(vl, (850, 381, 1010, 388), "O1 left PROC slit", want="into ref 26..70")
    stats(vl, (700, 330, 1100, 400), "O1 left PROC full gear window", want="ref-class 26..70, discs read")
    stats(vl, (60, 330, 460, 400), "   left REF full gear window")
    vf = load(b, "view-front")
    stats(vf, (742, 420, 817, 540), "O2/O3 front PROC L corner", want="flaps ~57..64 / wrap smooth")
    stats(vf, (100, 420, 175, 540), "   front REF L flap")
    stats(vf, (1100, 420, 1175, 540), "O2/O3 front PROC R corner")
    stats(vf, (760, 155, 810, 200), "O4a front PROC TOGS body", want="g-dominant, toward ctx 47")
    stats(vf, (908, 310, 1010, 360), "O4b front PROC travel-lock box", want="toward ref glacis 47")
    for r, tag in (((1066, 206, 1095, 222), "cheek periscope pair"), ((767, 346, 799, 358), "headlight L"),
                   ((1120, 346, 1152, 358), "headlight R"), ((889, 128, 917, 134), "roof chip A"),
                   ((1000, 184, 1019, 190), "roof chip B")):
        chip(vf, r, f"O4c {tag}")
    rr = load(b, "view-rearright")
    stats(rr, (1060, 280, 1110, 292), "O4a rearright PROC kit plank", want="toward box ctx 37.5")
    re = load(b, "view-rear")
    stats(re, (745, 440, 820, 560), "O3 rear PROC L corner", want="flap ~57 class")
    stats(re, (80, 440, 175, 560), "   rear REF L flap")

for w in WHICH:
    if w in ("c3", "all"): c3()
    if w in ("c5", "all"): c5()
    if w in ("ch1", "all"): ch1()
