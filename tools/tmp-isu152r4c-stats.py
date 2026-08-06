#!/usr/bin/env python3
# TEMP (isu152 r4 independent critic): pane bbox + registration audit over all
# 14 fresh pairs in shots/critic-isu152/. Mask method: bg discriminator
# |px - (0x15,0x1b,0x20)| maxch <= 13 -> background; label rows y<40 excluded.
# Deleted after the round.
import json, sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-isu152"
VIEWS = ["view-front","view-frontleft","view-left","view-rearleft","view-rear",
         "view-rearright","view-right","view-frontright","view-top",
         "hero-frontleft","hero-rearright","hero-toptilt","close-front","close-roof"]

def load(view):
    im = Image.open(f"{SHOTS}/{view}.png").convert("RGB")
    return im

def mask_of(im, x0, x1):
    w, h = im.size
    px = im.load()
    m = []
    for y in range(h):
        row = []
        for x in range(x0, x1):
            r, g, b = px[x, y]
            bg = abs(r-BG[0]) <= 13 and abs(g-BG[1]) <= 13 and abs(b-BG[2]) <= 13
            row.append(0 if bg else 1)
        m.append(row)
    return m

def bbox(m, ymin=40):
    xs, ys = [], []
    for y in range(ymin, len(m)):
        row = m[y]
        for x, v in enumerate(row):
            if v:
                xs.append(x); ys.append(y)
    if not xs: return None
    return [min(xs), max(xs), min(ys), max(ys)]

out = {}
for v in VIEWS:
    im = load(v)
    ref = mask_of(im, 0, 640)
    proc = mask_of(im, 640, 1280)
    rb, pb = bbox(ref), bbox(proc)
    # edge contact: does content touch pane edges (crop indicator)?
    def edges(b, m):
        if b is None: return None
        x0, x1, y0, y1 = b
        return {"L": x0 <= 1, "R": x1 >= 638, "T": y0 <= 41, "B": y1 >= 638}
    out[v] = {
        "ref_bbox": rb, "proc_bbox": pb,
        "ref_wh": [rb[1]-rb[0]+1, rb[3]-rb[2]+1] if rb else None,
        "proc_wh": [pb[1]-pb[0]+1, pb[3]-pb[2]+1] if pb else None,
        "ref_edges": edges(rb, ref), "proc_edges": edges(pb, proc),
    }
    print(v, "ref", out[v]["ref_bbox"], out[v]["ref_wh"], out[v]["ref_edges"],
          "| proc", out[v]["proc_bbox"], out[v]["proc_wh"], out[v]["proc_edges"], flush=True)

with open("/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/isu152r4-bboxes.json", "w") as f:
    json.dump(out, f, indent=1)
print("saved json")
