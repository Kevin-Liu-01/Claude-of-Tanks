#!/usr/bin/env python3
# TEMP diagnosis crops for the m1a2 r6 graduation verdict (NEVER verdict
# evidence — §D: official pairs only). Writes 4x/6x crops of the wheel band,
# tail bay, bow taper, and duffel trio to the session scratchpad.
import sys
from PIL import Image

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-m1a2"
OUT = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad"

def crop(name, box, scale, out):
    im = Image.open(f"{SHOTS}/{name}.png").convert("RGB")
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f"{OUT}/{out}.png")
    print(out, c.size)

# view-left: proc pane x 640-1280. band rows ~350-395. full run.
crop("view-left", (685, 330, 1240, 400), 3, "r6-left-band-proc")
crop("view-left", (45, 330, 600, 400), 3, "r6-left-band-ref")
# tail bay (left view: tail at left end of pane)
crop("view-left", (685, 300, 860, 400), 5, "r6-left-tail-proc")
crop("view-left", (45, 300, 220, 400), 5, "r6-left-tail-ref")
# bow (right end)
crop("view-left", (1060, 300, 1240, 400), 5, "r6-left-bow-proc")
crop("view-left", (420, 300, 600, 400), 5, "r6-left-bow-ref")
# right view mid-run
crop("view-right", (790, 330, 1240, 400), 3, "r6-right-band-proc")
crop("view-right", (150, 330, 600, 400), 3, "r6-right-band-ref")
# rear quarters: near tail corner
crop("view-rearleft", (700, 280, 950, 400), 4, "r6-rearleft-tail-proc")
crop("view-rearleft", (64, 280, 314, 400), 4, "r6-rearleft-tail-ref")
crop("view-rearright", (1030, 280, 1280, 400), 4, "r6-rearright-tail-proc")
crop("view-rearright", (330, 280, 580, 400), 4, "r6-rearright-tail-ref")
# duffel trio from plan (top: rear at image top)
crop("view-top", (858, 60, 1062, 170), 4, "r6-top-rack-proc")
crop("view-top", (218, 60, 422, 170), 4, "r6-top-rack-ref")
# hero flanks
crop("hero-frontleft", (700, 330, 1100, 450), 3, "r6-hero-fl-band-proc")
crop("hero-rearright", (760, 330, 1240, 500), 2, "r6-hero-rr-band-proc")
