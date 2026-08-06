#!/usr/bin/env python3
# TEMP r8 critic zoom-6x gear-window crops + disc-profile probe (deleted after round).
import os
from PIL import Image
import numpy as np

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1/crops-r8"

def luma(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

CROPS = [
    ("view-left", "gearzoom-ref", (220, 355, 360, 400), 6),
    ("view-left", "gearzoom-proc", (860, 355, 1000, 400), 6),
    ("view-right", "gearzoom-proc", (990, 355, 1130, 400), 6),
]
for view, name, box, z in CROPS:
    img = Image.open(os.path.join(SRC, f"{view}.png")).convert("RGB")
    c = img.crop(box)
    c = c.resize((c.width * z, c.height * z), Image.NEAREST)
    c.save(os.path.join(OUT, f"{name}.png"))

# Horizontal luma profile along the wheel band mid-row: does it oscillate
# (disc / shadow / disc) like the ref, or run flat (wall)?
img = np.asarray(Image.open(os.path.join(SRC, "view-left.png")).convert("RGB"), dtype=np.float64)
for tag, x0, x1 in (("REF ", 210, 445), ("PROC", 850, 1085)):
    band = luma(img[368:378, x0:x1]).mean(axis=0)  # rows y368..377 (wheel mid-band)
    q = np.round(band / 10).astype(int)
    print(tag, "y368..377 luma profile (x", x0, "..", x1, ") /10:")
    print("   ", "".join(str(min(v, 9)) for v in q))
    lo, hi = band.min(), band.max()
    osc = (np.abs(np.diff((band > (lo + hi) / 2).astype(int))) > 0).sum()
    print(f"    min {lo:.0f} max {hi:.0f} half-crossings {osc}")
print("crops written")
