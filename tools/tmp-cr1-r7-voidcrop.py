#!/usr/bin/env python3
# TEMP critic void-zone crops for challenger1 r7 (deleted after round).
# Finds ENCLOSED sky-signature components in a region and draws boxes.
from PIL import Image, ImageDraw

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = f"{SRC}/crops-r7"
BG = (0x15, 0x1B, 0x20)


def is_sky(px):
    r, g, b = px
    maxch = max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2]))
    return maxch <= 13 and (b - r) >= 8


def enclosed_components(view, box, tag, zoom=3):
    img = Image.open(f"{SRC}/{view}.png").convert("RGB")
    w, h = box[2] - box[0], box[3] - box[1]
    sky = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            sky[y][x] = is_sky(img.getpixel((box[0] + x, box[1] + y)))
    # flood-fill labels; a component touching the box border is OPEN (ambient bg)
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if sky[y0][x0] and not seen[y0][x0]:
                stack = [(x0, y0)]
                seen[y0][x0] = True
                px_list = []
                touches = False
                while stack:
                    x, y = stack.pop()
                    px_list.append((x, y))
                    if x in (0, w - 1) or y in (0, h - 1):
                        touches = True
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and sky[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                comps.append((touches, px_list))
    crop = img.crop(box).resize((w * zoom, h * zoom), Image.NEAREST)
    dr = ImageDraw.Draw(crop)
    n_enc = 0
    for touches, px_list in comps:
        if touches or len(px_list) < 4:
            continue
        n_enc += 1
        xs = [p[0] for p in px_list]
        ys = [p[1] for p in px_list]
        dr.rectangle([min(xs) * zoom - 2, min(ys) * zoom - 2, max(xs) * zoom + 2, max(ys) * zoom + 2], outline=(255, 60, 60), width=2)
        print(f"{tag}: ENCLOSED sky comp {len(px_list)} px at img ({box[0]+min(xs)},{box[1]+min(ys)})..({box[0]+max(xs)},{box[1]+max(ys)})")
    if n_enc == 0:
        print(f"{tag}: no enclosed sky components (open-background only)")
    crop.save(f"{OUT}/void-{tag}.png")


enclosed_components("close-roof", (640, 330, 1100, 520), "close-roof")
enclosed_components("hero-rearright", (700, 240, 1000, 400), "hero-rr")
