# TEMP (abrams density re-cert critic): BEFORE|AFTER comparison crops from the
# PROC halves of baseline (cheekgun) vs fresh (densityrecert) pair PNGs, with
# optional brightness gain for dark rear views. Coords HALF-relative.
# Usage: python3 tools/tmp-densityrecert-ba.py <id> <view> <x0> <y0> <x1> <y1> <scale> <gain> <out.png>
import sys
from PIL import Image, ImageEnhance

SIZE = 640
ROOT = '/Users/kevinliu/claude-of-tanks/shots'


def main():
    tid, view, x0, y0, x1, y1, scale, gain, out = sys.argv[1:10]
    x0, y0, x1, y1, scale, gain = int(x0), int(y0), int(x1), int(y1), int(scale), float(gain)
    before = Image.open(f'{ROOT}/critic-{tid}-cheekgun/{view}.png').convert('RGB')
    after = Image.open(f'{ROOT}/critic-{tid}-densityrecert/{view}.png').convert('RGB')
    def grab(im):
        c = im.crop((SIZE + x0, y0, SIZE + x1, y1))
        c = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
        if gain != 1.0:
            c = ImageEnhance.Brightness(c).enhance(gain)
        return c
    a, b = grab(before), grab(after)
    outim = Image.new('RGB', (a.width + b.width + 8, a.height + 18), (20, 24, 28))
    outim.paste(a, (0, 18))
    outim.paste(b, (a.width + 8, 18))
    outim.save(out)
    print(out, outim.size, '(left=BEFORE cheekgun, right=AFTER density)')


if __name__ == '__main__':
    main()
