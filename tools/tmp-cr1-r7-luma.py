#!/usr/bin/env python3
# TEMP critic luma measurement for challenger1 r7 (deleted after round).
# ITU-601 luma over cited rects + a levels-stretched crop of the gear band.
from PIL import Image, ImageOps

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = f"{SRC}/crops-r7"


def luma_rect(img, box, label):
    px = img.crop(box).convert("RGB")
    w, h = px.size
    tot = n = 0
    lo, hi = 255, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px.getpixel((x, y))
            l = 0.299 * r + 0.587 * g + 0.114 * b
            tot += l
            n += 1
            lo = min(lo, l)
            hi = max(hi, l)
    print(f"{label}: box={box} mean luma {tot/n:.1f} (min {lo:.0f} max {hi:.0f})")


img = Image.open(f"{SRC}/view-left.png").convert("RGB")
# wheel band rows: below skirt hem, above ground shadow. Image is 1280x640.
# ref tank spans x 45..595; proc 685..1235. Wheel band in ref ~y 355..390; proc same rows.
luma_rect(img, (160, 358, 440, 388), "REF  left wheel band ")
luma_rect(img, (800, 358, 1080, 388), "PROC left wheel band ")
# skirt face reference tone (above hem) for contrast ratio
luma_rect(img, (160, 320, 440, 350), "REF  left skirt face ")
luma_rect(img, (800, 320, 1080, 350), "PROC left skirt face ")

# levels-stretched proc gear band to reveal geometry in shadow
crop = img.crop((700, 300, 1120, 420))
st = ImageOps.autocontrast(crop, cutoff=1)
st = st.resize((crop.width * 3, crop.height * 3), Image.NEAREST)
st.save(f"{OUT}/gear-left-proc-stretched.png")
refc = img.crop((45, 300, 465, 420))
rst = ImageOps.autocontrast(refc, cutoff=1)
rst = rst.resize((refc.width * 3, refc.height * 3), Image.NEAREST)
rst.save(f"{OUT}/gear-left-ref-stretched.png")
print("stretched crops saved")
