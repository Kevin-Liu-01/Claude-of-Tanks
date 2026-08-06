#!/usr/bin/env python3
# TEMP critic sky tests for challenger1 r7 (deleted after round).
# MASK-METHOD (bg |px-0x151b20| maxch <= 13) PLUS BLUE-SIGNATURE (B-R >= +8)
# per BUILD-STANDARD §D (revolution-r7 law).
from PIL import Image

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
BG = (0x15, 0x1B, 0x20)  # 21,27,32


def skytest(view, box, label):
    img = Image.open(f"{SRC}/{view}.png").convert("RGB")
    w = box[2] - box[0]
    h = box[3] - box[1]
    n = w * h
    sky = 0
    maxch_only = 0
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            r, g, b = img.getpixel((x, y))
            maxch = max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2]))
            if maxch <= 13:
                maxch_only += 1
                if b - r >= 8:
                    sky += 1
    print(f"{label}: {view} rect {box} -> SKY {sky}/{n} px (maxch-only {maxch_only})")


# 1. top-view bow notch between the wings (x -0.94..+0.94 world, z 3.1..4.1)
# proc tank in view-top: x_img 878..1042 (3.51m), nose y~441, 46.7 px/m.
# gun tube occupies x_img ~952..968; test both sides of it.
skytest("view-top", (916, 392, 950, 438), "bow-notch LEFT of gun ")
skytest("view-top", (970, 392, 1004, 438), "bow-notch RIGHT of gun")
# control: known-background rect outside the tank
skytest("view-top", (700, 300, 730, 330), "control bg            ")
# control: ref same zone (ref tank x_img 238..402, nose y~443)
skytest("view-top", (276, 392, 310, 438), "REF same zone L       ")

# 2. close-roof enclosed void 0.055 m^2 @ world (0.86, 0.34, 2.94)
# close-roof proc pane x 640..1280; probe the gun-root/cheek gap region.
# The evaluator void: repro by scanning the region under the gun root for
# sky-signature pixels (region: image x 700..900, y 400..470 est).
skytest("close-roof", (680, 390, 920, 480), "close-roof void zone  ")

# 3. hero-rearright tiny void 0.002 m^2 @ ~(1.94, 1.21, 3.42)
skytest("hero-rearright", (760, 280, 900, 360), "hero-rr void zone     ")
