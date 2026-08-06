#!/usr/bin/env python3
# TEMP r8 critic §B2 void adjudication (deleted after round).
# Mask-method (bg |px-0x151b20| maxch<=13) + BLUE-SIGNATURE (B-R>=+8) per §D,
# flood-fill from borders, connected components of ENCLOSED sky.
# Result r8: close-roof ONE real 141-px pocket seed (y526,x261 proc-half)
# = world ~(0.86,0.34,2.94) bow ramp triangle (idler/strap/shoe-run frame);
# all other components are the "PROCEDURAL" label speckle at y<=16.
# hero-rearright: label speckle + 5px only (r7 projection-sliver class).
from PIL import Image
import numpy as np
from collections import deque
import sys

def enclosed_components(path):
    img = np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)
    proc = img[:, 640:, :]
    bg = np.array([0x15, 0x1b, 0x20], dtype=np.int16)
    maxch = np.abs(proc - bg).max(axis=2)
    sky = (maxch <= 13) & ((proc[:, :, 2] - proc[:, :, 0]) >= 8)
    h, w = sky.shape
    seen = np.zeros_like(sky, dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if sky[y, x] and not seen[y, x]: seen[y, x] = True; dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if sky[y, x] and not seen[y, x]: seen[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and sky[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; dq.append((ny, nx))
    enc = sky & ~seen
    lab = np.zeros_like(enc, dtype=int)
    comps = []
    cid = 0
    for y in range(h):
        for x in range(w):
            if enc[y, x] and lab[y, x] == 0:
                cid += 1
                q = deque([(y, x)]); lab[y, x] = cid; n = 0
                while q:
                    cy, cx = q.popleft(); n += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and enc[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = cid; q.append((ny, nx))
                comps.append((n, (y, x)))
    comps.sort(reverse=True)
    return comps[:6]

for v in ("close-roof", "hero-rearright"):
    print(v, enclosed_components(f"shots/critic-challenger1/{v}.png"))
