#!/usr/bin/env python3
# TEMP r8 critic MG/smoke/plan zooms (deleted after round).
import os
from PIL import Image

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1/crops-r8"

CROPS = [
    # MG hunt: close-roof crown center (frame coords)
    ("close-roof", "mg-closeroof", (980, 240, 1180, 340), 4),
    # MG in plan: turret left-rear (top view, rear = up); turret ~y 200..380
    ("view-top", "mg-top", (880, 180, 1050, 320), 4),
    # MG from left ortho: turret roof line
    ("view-left", "mg-left", (830, 240, 1030, 310), 4),
    # MG from rear: left rear roof = right side of image? (rear view mirrors)
    ("view-rear", "mg-rear", (930, 130, 1130, 240), 4),
    # smoke banks close-front: left cheek + right cheek
    ("close-front", "smoke-cf-left", (640, 280, 860, 420), 3),
    ("close-front", "smoke-cf-right", (940, 300, 1140, 430), 3),
    ("view-front", "smoke-front", (700, 240, 1240, 330), 2),
    # ref smoke for comparison
    ("view-front", "smoke-front-ref", (60, 240, 600, 330), 2),
]
for view, name, box, z in CROPS:
    img = Image.open(os.path.join(SRC, f"{view}.png")).convert("RGB")
    c = img.crop(box)
    c = c.resize((c.width * z, c.height * z), Image.NEAREST)
    c.save(os.path.join(OUT, f"{name}.png"))
print("done")
