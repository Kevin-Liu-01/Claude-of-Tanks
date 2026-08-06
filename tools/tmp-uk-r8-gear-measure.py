# TEMP (uk combined round 3, 2026-08-05): W1/W2 (centurion3 shaded-parity r7),
# O7 (centurion5 r7), O1a/b/c (challenger1 r8) wheel-ring done-gate windows —
# the rects are the three critics' own (ITU-601 luma; fg = NOT(bg maxch<=13
# AND B-R>=+8) per BUILD-STANDARD sect D). Reads shots/critic-<id>/*.png pairs
# (1280x640: REF left half, PROC right half).
#   python3 tools/tmp-uk-r8-gear-measure.py [c3|c5|ch1|all] [--c3=DIR ...]
from PIL import Image
import numpy as np
import sys

BG = np.array([0x15, 0x1B, 0x20], float)
BASE = {"ch1": "shots/critic-challenger1", "c5": "shots/critic-centurion5", "c3": "shots/critic-centurion3"}
for a in sys.argv[1:]:
    for k in BASE:
        if a.startswith(f"--{k}="):
            BASE[k] = a.split("=", 1)[1]
WHICH = [a for a in sys.argv[1:] if not a.startswith("--")] or ["all"]
P = 640

def load(base, view):
    return np.asarray(Image.open(f"{base}/{view}.png").convert("RGB"), float)

def luma(x):
    return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]

def fg_mask(x):
    d = np.abs(x - BG).max(-1)
    blue = (x[..., 2] - x[..., 0]) >= 8
    return ~((d <= 13) & blue)

def stats(a, r, tag, subs=(), want=""):
    x = a[r[1]:r[3], r[0]:r[2]]
    m = fg_mask(x)
    L = luma(x)[m]
    if L.size == 0:
        print(f"{tag:46s} EMPTY fg"); return
    out = (f"{tag:46s} mean {L.mean():5.1f} med {np.median(L):5.1f} p5 {np.percentile(L,5):5.1f} "
           f"p95 {np.percentile(L,95):5.1f} sd {L.std():4.1f}")
    for s in subs:
        out += f" sub{s} {(L < s).sum()}"
    if want:
        out += f"   [{want}]"
    print(out)

def c3():
    b = BASE["c3"]
    print(f"== centurion3 W1/W2 done-gates [{b}] ==")
    vl = load(b, "view-left")
    stats(vl, (60 + P, 368, 590 + P, 404), "W1 left gear band PROC", subs=(30,), want="p95<=65 sd<=7 sub30<=400")
    stats(vl, (60, 368, 590, 404), "   left gear band REF", subs=(30,))
    cf = load(b, "close-front")
    stats(cf, (0 + P, 330, 640 + P, 478), "W2 close-front band PROC", subs=(30,), want="p95<=75 no new sub30")
    stats(cf, (0, 330, 640, 478), "   close-front band REF", subs=(30,))
    vf = load(b, "view-front")
    for x0, x1, side in ((72, 178, "L"), (462, 568, "R")):
        stats(vf, (x0 + P, 352, x1 + P, 548), f"W3 front col {side} PROC (watch)", subs=(30,), want="med toward 57, p5>=30")
        stats(vf, (x0, 352, x1, 548), f"   front col {side} REF", subs=(30,))

def c5():
    b = BASE["c5"]
    print(f"== centurion5 O7 done-gates [{b}] ==")
    vl = load(b, "view-left")
    stats(vl, (802, 374, 858, 402), "O7 one-disc interior PROC", want="into ref 51.4/p95 55.9 band")
    stats(vl, (247, 341, 293, 387), "   one-disc interior REF")
    stats(vl, (700, 340, 1100, 400), "O7 left band PROC", subs=(30,), want="ref 51.3 sd 9.2 family")
    stats(vl, (60, 340, 460, 400), "   left band REF", subs=(30,))
    stats(vl, (720, 378, 1080, 396), "   horn/pad row PROC (watch)", want="med toward ref ~52")

def ch1():
    b = BASE["ch1"]
    print(f"== challenger1 O1a/b/c done-gates [{b}] ==")
    vl = load(b, "view-left")
    stats(vl, (850, 360, 1010, 390), "O1 left window band PROC", subs=(30,), want="mean ~53 p5 toward 25.8 p95<=70")
    stats(vl, (210, 360, 370, 390), "   left window band REF", subs=(30,))
    vr = load(b, "view-right")
    stats(vr, (850, 360, 1010, 390), "O1 right window band PROC", subs=(30,), want="toward ref 47.8")
    stats(vr, (210, 360, 370, 390), "   right window band REF", subs=(30,))
    # disc oscillation profile (the r8 critic's y368..377 periodicity check):
    # luma along x through the wheel line — dark gaps between pale discs.
    x = vl[368:377, 850 + 0:1010 + 0]
    prof = luma(vl[368:377, 850:1010]).mean(0)
    lo, hi = prof.min(), prof.max()
    print(f"O1 y368..377 profile PROC min {lo:5.1f} max {hi:5.1f} swing {hi-lo:5.1f}   [discs-vs-gaps oscillation]")
    profR = luma(vl[368:377, 210:370]).mean(0)
    print(f"   y368..377 profile REF  min {profR.min():5.1f} max {profR.max():5.1f} swing {profR.max()-profR.min():5.1f}")

if __name__ == "__main__":
    w = WHICH[0]
    if w in ("c3", "all"): c3()
    if w in ("c5", "all"): c5()
    if w in ("ch1", "all"): ch1()
