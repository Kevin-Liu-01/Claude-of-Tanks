#!/usr/bin/env python3
# TEMP crop extractor for the m1a2 r3 critic — magnified pair crops for
# close verification. Reads ONLY shots/critic-m1a2/*.png. Writes crops to
# the session scratchpad (diagnosis aids, not verdict evidence rigs).
import sys, os
from PIL import Image

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
OUT = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops"
os.makedirs(OUT, exist_ok=True)

def crop(view, name, box, scale=3):
    im = Image.open(f"{SHOTS}/{view}.png").convert("RGB")
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f"{OUT}/{name}.png")
    print(f"{name}: {view} {box} x{scale} -> {c.width}x{c.height}")

def pair(view, name, refbox, dx=640, scale=3):
    """side-by-side ref|proc crop at the same pane-relative station."""
    im = Image.open(f"{SHOTS}/{view}.png").convert("RGB")
    x0, y0, x1, y1 = refbox
    r = im.crop((x0, y0, x1, y1))
    p = im.crop((x0+dx, y0, x1+dx, y1))
    w, h = r.width, r.height
    canvas = Image.new("RGB", (w*2*scale + 12, h*scale), (40, 40, 48))
    canvas.paste(r.resize((w*scale, h*scale), Image.NEAREST), (0, 0))
    canvas.paste(p.resize((w*scale, h*scale), Image.NEAREST), (w*scale + 12, 0))
    canvas.save(f"{OUT}/{name}.png")
    print(f"{name}: {view} ref{refbox} + proc(+{dx}) x{scale} -> {canvas.width}x{canvas.height}")

# 1) close-roof ring drums / M240 / CROWS (proc coords differ from ref due to framing;
#    separate crops per pane)
crop("close-roof", "cr-ref-drums", (380, 200, 620, 340), 3)
crop("close-roof", "cr-proc-roofband", (890, 180, 1280, 330), 3)
crop("close-roof", "cr-proc-crows", (900, 195, 1090, 285), 4)
crop("close-roof", "cr-proc-rings", (1010, 260, 1280, 340), 4)

# 2) view-top rings + saddle + recess moats
pair("view-top", "top-saddle-rings", (255, 150, 425, 330), scale=4)
# top flank ladders (sun side = image right)
pair("view-top", "top-flankR", (390, 150, 430, 450), scale=4)
pair("view-top", "top-flankL", (210, 150, 250, 450), scale=4)
# top rear rack (image top) duffel read
pair("view-top", "top-rack", (230, 40, 410, 130), scale=4)

# 3) view-front CROWS + portal + glacis
pair("view-front", "front-turret", (150, 90, 500, 340), scale=2)
pair("view-front", "front-crows", (280, 90, 430, 200), scale=4)
crop("view-front", "front-proc-portal", (890, 200, 1060, 330), 4)
crop("view-front", "front-ref-mantlet", (250, 200, 420, 330), 4)

# 4) slit zooms
crop("view-left", "left-proc-slit", (990, 270, 1110, 340), 5)
crop("view-left", "left-ref-slitstation", (350, 260, 470, 330), 5)
crop("view-right", "right-proc-slit", (820, 270, 940, 340), 5)
crop("view-right", "right-ref-slitstation", (180, 260, 300, 330), 5)

# 5) view-rear bright band rows 419-440 within (849,350)-(1069,440) + grille field
crop("view-rear", "rear-proc-brightband", (840, 400, 1080, 470), 4)
crop("view-rear", "rear-ref-same", (200, 395, 440, 465), 4)
pair("view-rear", "rear-plate", (170, 320, 470, 480), scale=2)

# 6) hero-toptilt rings recess + CROWS + the void wedge region
crop("hero-toptilt", "tt-proc-rings", (880, 280, 1120, 420), 3)
crop("hero-toptilt", "tt-ref-rings", (260, 280, 500, 420), 3)
crop("hero-toptilt", "tt-proc-wedge", (760, 100, 1100, 360), 2)
# proc saddle capsules at toptilt
crop("hero-toptilt", "tt-proc-saddle", (860, 200, 1060, 320), 3)
crop("hero-toptilt", "tt-ref-saddle", (300, 380, 560, 540), 3)

# 7) close-front bow / track containment / M240+CROWS skyline
pair("close-front", "cf-bow", (0, 300, 460, 445), scale=2)
crop("close-front", "cf-proc-skyline", (640, 160, 1000, 320), 3)
crop("close-front", "cf-ref-skyline", (0, 160, 360, 320), 3)

# 8) hero-frontleft CROWS station + skyline
crop("hero-frontleft", "hfl-proc-skyline", (680, 190, 1080, 340), 3)
crop("hero-frontleft", "hfl-ref-skyline", (60, 190, 460, 340), 3)

# 9) hero-rearright roof + M240 + rings from rear quarter
crop("hero-rearright", "hrr-proc-roof", (860, 220, 1240, 360), 3)
crop("hero-rearright", "hrr-ref-roof", (250, 220, 630, 360), 3)

# 10) view-left/right skyline strip (fused container stack vs ref lanes)
pair("view-left", "left-skyline", (60, 240, 600, 310), scale=2)
pair("view-rearleft", "rl-skyline", (60, 240, 530, 320), scale=2)
