# TEMP (leo2_revolution r19 re-cert critic): enclosed-sky flood on the PROC
# half of my fresh pairs, r18 critic method: sky = |ch - bg| <= 13 per
# channel AND (B - R) >= 8; border-connected flood removed; label band
# y13-21 excluded (§J PAIR-PNG law). Compare against the banked r18 counts.
import os
import numpy as np
from PIL import Image
from collections import deque

SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2_revolution'
R18 = {'view-front': 486, 'view-frontleft': 58, 'view-left': 66,
       'view-rearleft': 557, 'view-rear': 5, 'view-rearright': 230,
       'view-right': 81, 'view-frontright': 175, 'view-top': 443,
       'hero-frontleft': 1, 'hero-rearright': 0, 'hero-toptilt': 0,
       'close-front': 16, 'close-roof': 19}

for name, r18n in R18.items():
    a = np.asarray(Image.open(f'{SRC}/{name}.png').convert('RGB'), dtype=np.int16)
    proc = a[:, 640:]
    h, w = proc.shape[:2]
    bg = np.median(proc[np.r_[0:8, h-8:h], :].reshape(-1, 3), axis=0)
    sky = (np.abs(proc - bg) <= 13).all(axis=2) & ((proc[..., 2] - proc[..., 0]) >= 8)
    sky[13:22, :] = False  # label band
    # flood from borders
    seen = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if sky[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if sky[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and sky[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                dq.append((ny, nx))
    enclosed = int((sky & ~seen).sum())
    print(f'{name}: enclosed {enclosed} (r18 banked {r18n}, delta {enclosed - r18n:+d})')
