# TEMP (abrams density re-cert critic): upscaled crops from the OFFICIAL
# critic pair PNGs (crops OF official-rig renders — the 1x-4x read workflow).
# Usage:
#   python3 tools/tmp-densityrecert-crop.py <pair.png> <half:ref|proc|both> \
#       <x0> <y0> <x1> <y1> <scale> <out.png>
# Coords are HALF-relative (0..639). 'both' writes a side-by-side of the same
# crop from REF and PROC halves.
import sys
from PIL import Image

SIZE = 640


def main():
    path, half, x0, y0, x1, y1, scale, out = sys.argv[1:9]
    x0, y0, x1, y1, scale = int(x0), int(y0), int(x1), int(y1), int(scale)
    im = Image.open(path).convert('RGB')
    def grab(off):
        c = im.crop((off + x0, y0, off + x1, y1))
        return c.resize((c.width * scale, c.height * scale), Image.NEAREST)
    if half == 'ref':
        outim = grab(0)
    elif half == 'proc':
        outim = grab(SIZE)
    else:
        a, b = grab(0), grab(SIZE)
        outim = Image.new('RGB', (a.width + b.width + 8, a.height), (20, 24, 28))
        outim.paste(a, (0, 0))
        outim.paste(b, (a.width + 8, 0))
    outim.save(out)
    print(out, outim.size)


if __name__ == '__main__':
    main()
