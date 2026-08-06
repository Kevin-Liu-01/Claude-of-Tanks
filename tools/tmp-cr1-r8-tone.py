#!/usr/bin/env python3
# TEMP critic tone measurements for challenger1 r8 (deleted after round).
# ITU-601 luma rects on the OFFICIAL critic renders, re-deriving the r7
# windows + tone-round claims. Every rect is (l, t, r, b) in the 1280x640
# pair frame (ref half x<640, proc half x>=640).
import os
from PIL import Image
import numpy as np

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"

def luma(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

def stats(view, name, box):
    img = np.asarray(Image.open(os.path.join(SRC, f"{view}.png")).convert("RGB"), dtype=np.float64)
    l, t, r, b = box
    a = img[t:b, l:r]
    L = luma(a)
    rgb = a.reshape(-1, 3).mean(axis=0)
    print(f"{view:16s} {name:28s} rect({l},{t})..({r},{b}) "
          f"luma mean {L.mean():5.1f} p5 {np.percentile(L,5):5.1f} p95 {np.percentile(L,95):5.1f} min {L.min():3.0f} "
          f"rgb ({rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f}) b-r {rgb[2]-rgb[0]:+.1f} g-r {rgb[1]-rgb[0]:+.1f}")
    return L, a

print("=== O1 GEAR WINDOW (r7: ref band 52.6 [26..70]; proc slit 15.0/p5 7; claim 54.1 vs 54.8) ===")
stats("view-left", "REF gear band", (210, 360, 370, 390))
stats("view-left", "PROC gear band (mirror)", (850, 360, 1010, 390))
stats("view-left", "PROC r7 slit rect", (850, 381, 1010, 388))
stats("view-right", "REF gear band", (330, 360, 490, 390))
stats("view-right", "PROC gear band", (970, 360, 1130, 390))

print("=== O2/O3 FRONT CORNERS (r7: ref 64.3 / proc 31.3 min 1; claim 50.0/48.4) ===")
stats("view-front", "REF corner L", (100, 420, 175, 540))
stats("view-front", "REF corner R", (462, 420, 537, 540))
stats("view-front", "PROC corner L", (742, 420, 817, 540))
stats("view-front", "PROC corner R", (1102, 420, 1177, 540))

print("=== O2/O3 REAR CORNERS (r7: ref 57.0 / proc 19.6; claim 55.0 vs ref flap 63.5) ===")
stats("view-rear", "REF corner L", (80, 440, 175, 560))
stats("view-rear", "PROC corner L", (745, 440, 820, 560))
stats("view-rear", "REF corner R", (465, 440, 560, 560))
stats("view-rear", "PROC corner R", (1105, 440, 1180, 560))

print("=== O4a TOGS + caps (r7: rgb 61,61,47 r=g vs ref ctx 47.2 g-dom; claim 47-49 g-dom) ===")
stats("view-front", "REF face ctx", (300, 155, 350, 200))
stats("view-front", "PROC TOGS body", (760, 155, 810, 200))
print("=== O4b travel-lock/glacis box (r7: 59.6 warm; claim 55,58,47) ===")
stats("view-front", "REF glacis ctx", (268, 310, 370, 360))
stats("view-front", "PROC glacis box", (908, 310, 1010, 360))

print("=== O4c BLUE CHIPS x8 (r7: b-r +12..+22; claim -3..-5.3) ===")
stats("view-front", "chip cheek-periscope pair", (1066, 206, 1095, 222))
stats("view-front", "chip headlight L", (767, 346, 799, 358))
stats("view-front", "chip headlight R", (1120, 346, 1152, 358))
stats("view-front", "chip roof a", (889, 128, 917, 134))
stats("view-front", "chip roof b", (1000, 184, 1019, 190))

print("=== O4a plank (r7: rearright (1060,280)..(1110,292) luma 65.0 vs ctx 37.5) ===")
stats("view-rearright", "PROC plank", (1060, 280, 1110, 292))
stats("view-rearright", "PROC box ctx", (1060, 296, 1110, 320))
stats("view-rearright", "REF bustle ctx", (420, 280, 470, 320))
