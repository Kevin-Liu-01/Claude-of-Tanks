#!/usr/bin/env python3
# TEMP critic wheel-station probe for challenger1 r7 (deleted after round).
# 6x tight crops of one wheel station per side, raw + hard stretch, plus
# a luma row-profile down the wheel window to quantify what a player sees.
from PIL import Image, ImageOps

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = f"{SRC}/crops-r7"

for view, tag, box in [
    ("view-left", "L-mid", (850, 340, 1010, 400)),    # mid-run stations, left side
    ("view-right", "R-mid", (930, 340, 1090, 400)),   # mid-run stations, right side
]:
    img = Image.open(f"{SRC}/{view}.png").convert("RGB")
    c = img.crop(box)
    raw = c.resize((c.width * 6, c.height * 6), Image.NEAREST)
    raw.save(f"{OUT}/wheel-{tag}-raw6x.png")
    st = ImageOps.autocontrast(c, cutoff=0)
    st = st.resize((c.width * 6, c.height * 6), Image.NEAREST)
    st.save(f"{OUT}/wheel-{tag}-stretch6x.png")
    print(f"saved wheel-{tag} raw+stretch 6x {box}")

# ref same station for contrast
img = Image.open(f"{SRC}/view-left.png").convert("RGB")
c = img.crop((210, 340, 370, 400))
c.resize((c.width * 6, c.height * 6), Image.NEAREST).save(f"{OUT}/wheel-REF-raw6x.png")
print("saved wheel-REF raw 6x")

# luma row profile: mean luma per row, proc vs ref, over the gear window
def rowprofile(img, x0, x1, y0, y1, label):
    print(f"-- {label} rows y{y0}..{y1} x{x0}..{x1}")
    for y in range(y0, y1):
        tot = 0
        for x in range(x0, x1):
            r, g, b = img.getpixel((x, y))
            tot += 0.299 * r + 0.587 * g + 0.114 * b
        print(f"  y{y}: {tot/(x1-x0):5.1f}")

rowprofile(img, 210, 370, 348, 396, "REF  left station rows")
rowprofile(img, 850, 1010, 348, 396, "PROC left station rows")
