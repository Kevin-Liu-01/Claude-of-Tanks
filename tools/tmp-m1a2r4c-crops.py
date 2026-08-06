#!/usr/bin/env python3
# TEMP r4 critic: diagnosis crops ONLY (never verdict evidence — official pairs are).
# Writes zoomed crops to the session scratchpad for eyeball verification.
from PIL import Image
import sys, os

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
OUT = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops"
os.makedirs(OUT, exist_ok=True)

def crop(view, x0, y0, x1, y1, scale, name):
    im = Image.open(f"{SHOTS}/{view}.png").convert("RGB")
    c = im.crop((x0, y0, x1, y1))
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f"{OUT}/{name}.png")
    print(f"{name}: {view} ({x0},{y0})-({x1},{y1}) x{scale}")

# ORDER 1 lanes: proc lane-1 pocket + rails, ref mirror station
crop("view-left", 900, 235, 1140, 300, 5, "L-lanes-proc")
crop("view-left", 260, 233, 500, 298, 5, "L-lanes-ref")
crop("view-right", 880, 235, 1120, 300, 5, "R-lanes-proc")
crop("view-right", 120, 233, 360, 298, 5, "R-lanes-ref")
# ORDER 2 side dressing: works walls
crop("view-left", 740, 245, 1000, 340, 4, "L-dressing-proc")
crop("view-left", 100, 245, 360, 340, 4, "L-dressing-ref")
crop("view-right", 920, 245, 1180, 340, 4, "R-dressing-proc")
# ORDER 3 rounding: left tumblehome shoulder (frontleft + hero)
crop("view-frontleft", 690, 240, 900, 340, 4, "FL-shoulder-proc")
crop("view-frontleft", 60, 240, 270, 340, 4, "FL-shoulder-ref")
crop("hero-frontleft", 700, 200, 950, 340, 3, "heroFL-shoulder-proc")
crop("hero-frontleft", 60, 200, 310, 340, 3, "heroFL-shoulder-ref")
# ORDER 5 duffels from plan + ORDER 4 sun flank
crop("view-top", 860, 47, 1060, 175, 4, "top-rack-proc")
crop("view-top", 218, 47, 421, 175, 4, "top-rack-ref")
crop("view-top", 1020, 150, 1062, 470, 3, "top-sunflank-proc")
crop("view-top", 380, 150, 422, 470, 3, "top-sunflank-ref")
# ORDER 8 CROWS front legibility at 1x context + 4x
crop("view-front", 880, 85, 1180, 180, 2, "front-skyline-proc")
crop("view-front", 240, 85, 540, 180, 2, "front-skyline-ref")
crop("view-front", 1000, 90, 1140, 165, 5, "front-crows-proc4x")
crop("view-front", 60, 90, 240, 175, 4, "front-refM2")
# ORDER 7 wedge visual
crop("view-rear", 800, 390, 1120, 480, 3, "rear-wedge-proc")
crop("view-rear", 160, 385, 480, 475, 3, "rear-wedge-ref")
# rear skyline + rack + duffels from rear
crop("view-rear", 780, 125, 1140, 270, 2, "rear-skyline-proc")
crop("view-rear", 140, 120, 500, 265, 2, "rear-skyline-ref")
# containment: bow + stern
crop("close-front", 700, 330, 1100, 460, 2, "closefront-bow-proc")
crop("close-front", 60, 330, 460, 460, 2, "closefront-bow-ref")
crop("view-left", 660, 330, 800, 400, 4, "L-stern-wrap-proc")
crop("view-left", 30, 330, 170, 400, 4, "L-stern-wrap-ref")
crop("view-left", 1080, 330, 1240, 400, 4, "L-bow-wrap-proc")
crop("view-left", 440, 330, 600, 400, 4, "L-bow-wrap-ref")
# close-roof drum relief + station reads
crop("close-roof", 900, 200, 1200, 340, 2, "closeroof-stations-proc")
crop("close-roof", 300, 180, 600, 320, 2, "closeroof-stations-ref")
# hero-rearright rack towers + straps
crop("hero-rearright", 1080, 260, 1280, 420, 3, "heroRR-rack-proc")
crop("hero-rearright", 420, 250, 640, 410, 3, "heroRR-rack-ref")
# top: lanes from plan (transverse channels)
crop("view-top", 860, 300, 1060, 430, 3, "top-lanes-proc")
crop("view-top", 218, 300, 421, 430, 3, "top-lanes-ref")
print("done")
