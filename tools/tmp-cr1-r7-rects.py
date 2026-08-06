#!/usr/bin/env python3
# TEMP critic citation rects for challenger1 r7 (deleted after round).
# ITU-601 luma + rgb means for every tone claim in the verdict.
from PIL import Image

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"


def rect(view, box, label):
    img = Image.open(f"{SRC}/{view}.png").convert("RGB")
    w, h = box[2] - box[0], box[3] - box[1]
    n = w * h
    sr = sg = sb = sl = 0
    lo, hi = 255, 0
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            r, g, b = img.getpixel((x, y))
            l = 0.299 * r + 0.587 * g + 0.114 * b
            sr += r; sg += g; sb += b; sl += l
            lo = min(lo, l); hi = max(hi, l)
    print(f"{label:34s} {view:16s} {box} rgb ({sr/n:.0f},{sg/n:.0f},{sb/n:.0f}) luma {sl/n:.1f} [{lo:.0f}..{hi:.0f}]")


# FLAPS: ref pale flaps vs proc exposed wrap faces (front view)
rect("view-front", (100, 420, 175, 540), "REF front-left flap")
rect("view-front", (462, 420, 537, 540), "REF front-right flap")
rect("view-front", (742, 420, 817, 540), "PROC front-left wrap (no flap)")
rect("view-front", (1100, 420, 1175, 540), "PROC front-right wrap (no flap)")
# rear same class
rect("view-rear", (80, 440, 175, 560), "REF rear-left flap")
rect("view-rear", (745, 440, 820, 560), "PROC rear-left wrap (no flap)")
# TOGS sand pop (front view, vehicle-right = image-left of proc pane)
rect("view-front", (760, 155, 810, 200), "PROC TOGS body (sand)")
rect("view-front", (838, 128, 868, 148), "PROC bustle box top (ctx)")
# commander sight cap tan (front)
rect("view-front", (925, 232, 985, 262), "PROC sight cap (tan)")
# travel-lock / dust cover grey (front, below gun)
rect("view-front", (908, 310, 1010, 360), "PROC glacis box (warm grey)")
# ref same zones (face/glacis context)
rect("view-front", (240, 200, 400, 300), "REF turret face ctx")
rect("view-front", (240, 350, 420, 400), "REF glacis ctx")
# bustle tan plank (rearright)
rect("view-rearright", (1123, 285, 1180, 297), "PROC bustle plank (tan)")
rect("view-rearright", (350, 285, 470, 300), "REF bustle ctx")
# blue chips: headlight lenses (front fenders)
rect("view-front", (764, 349, 782, 359), "PROC headlight lens L (blue)")
rect("view-front", (1127, 349, 1145, 359), "PROC headlight lens R (blue)")
# black gear slit (left view, quantified rows earlier; cite one rect)
rect("view-left", (850, 381, 1010, 388), "PROC gear slit rows")
rect("view-left", (210, 360, 370, 390), "REF wheel band")
EOF_MARKER = None
