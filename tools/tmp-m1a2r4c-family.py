#!/usr/bin/env python3
# TEMP r4 critic: §H.4 variant-distinctiveness strip — proc panes only, four
# abrams-family members side view + top view stacked. Diagnosis only.
from PIL import Image
import os

OUT = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops"
os.makedirs(OUT, exist_ok=True)
IDS = ["m1a1", "m1a1ha", "m1a2_tejas", "m1a2"]

def strip(view, band, name):
    tiles = []
    for tid in IDS:
        p = f"/Users/kevinliu/claude-of-tanks/shots/critic-{tid}/{view}.png"
        im = Image.open(p).convert("RGB")
        c = im.crop((640, band[0], 1280, band[1]))
        tiles.append((tid, c))
    w = max(t[1].width for t in tiles)
    h = sum(t[1].height for t in tiles)
    canvas = Image.new("RGB", (w, h), (21, 27, 32))
    y = 0
    for tid, c in tiles:
        canvas.paste(c, (0, y))
        y += c.height
    canvas = canvas.resize((canvas.width*2, canvas.height*2), Image.NEAREST)
    canvas.save(f"{OUT}/{name}.png")
    print(name, "rows order:", IDS)

strip("view-left", (230, 400), "family-left-strip")
strip("view-top", (40, 600), "family-top-strip")
