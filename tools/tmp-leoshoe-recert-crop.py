# TEMP (leopard shoe re-cert): before/after zoom crops of the PROC half.
# Usage: python3 tools/tmp-leoshoe-recert-crop.py <baseDir> <candDir> <view> \
#          <x0> <y0> <x1> <y1> <zoom> <outPng>
# Coords are PROC-HALF pixel coords (0..639); output stacks BEFORE (top)
# and AFTER (bottom) with a 2px divider.
import sys
from PIL import Image

def main():
    bp, cp, view = sys.argv[1:4]
    x0, y0, x1, y1, z = map(int, sys.argv[4:9])
    out = sys.argv[9]
    a = Image.open(f'{bp}/{view}.png').convert('RGB')
    b = Image.open(f'{cp}/{view}.png').convert('RGB')
    W, H = a.size
    ox = W // 2
    ca = a.crop((ox + x0, y0, ox + x1, y1)).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
    cb = b.crop((ox + x0, y0, ox + x1, y1)).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
    o = Image.new('RGB', (ca.width, ca.height * 2 + 2), (255, 255, 0))
    o.paste(ca, (0, 0))
    o.paste(cb, (0, ca.height + 2))
    o.save(out)
    print(f'{view} [{x0},{y0},{x1},{y1}] z{z} -> {out} ({o.width}x{o.height})')

if __name__ == '__main__':
    main()
