# TEMP (isu122s r10): ITU-601 on-element rect stats + zoom crops off the
# critic pairs. Usage:
#   python3 tools/tmp-isu122s-r10-measure.py rect <img> <x0> <y0> <x1> <y1> [--sky]
#   python3 tools/tmp-isu122s-r10-measure.py crop <img> <x0> <y0> <x1> <y1> <out> [zoom]
#   python3 tools/tmp-isu122s-r10-measure.py col  <img> <x> <y0> <y1>   (per-pixel column dump)
# --sky: include sky pixels (default: sky-masked out, ON-ELEMENT stats).
import sys
from PIL import Image

SKY = (0x15, 0x1B, 0x20)


def luma(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def is_sky(px, tol=9):
    return abs(px[0] - SKY[0]) <= tol and abs(px[1] - SKY[1]) <= tol and abs(px[2] - SKY[2]) <= tol


def stats(img, x0, y0, x1, y1, mask_sky=True):
    im = Image.open(img).convert('RGB')
    vals = []
    sky = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = im.getpixel((x, y))
            if is_sky(p):
                sky += 1
                if mask_sky:
                    continue
            vals.append(luma(p))
    n = (x1 - x0) * (y1 - y0)
    if not vals:
        print(f'rect ({x0},{y0})-({x1},{y1}): ALL SKY ({n}px)')
        return
    vals.sort()
    q = lambda f: vals[min(len(vals) - 1, int(len(vals) * f))]
    mean = sum(vals) / len(vals)
    dark = sum(1 for v in vals if v < 45) / len(vals) * 100
    g = 0.0  # mean G excess (chroma sanity)
    im2 = Image.open(img).convert('RGB')
    print(f'rect ({x0},{y0})-({x1},{y1}) n={len(vals)}/{n} sky={sky} '
          f'L={mean:.1f} p05={q(.05):.1f} p25={q(.25):.1f} p50={q(.50):.1f} '
          f'p75={q(.75):.1f} p95={q(.95):.1f} spread(p75-p25)={q(.75)-q(.25):.1f} dark%={dark:.1f}')


def crop(img, x0, y0, x1, y1, out, zoom=4):
    im = Image.open(img).convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((im.width * zoom, im.height * zoom), Image.NEAREST)
    im.save(out)
    print(f'wrote {out} ({im.width}x{im.height})')


def col(img, x, y0, y1):
    im = Image.open(img).convert('RGB')
    for y in range(y0, y1):
        p = im.getpixel((x, y))
        tag = 'SKY' if is_sky(p) else f'{luma(p):6.1f}'
        print(f'  y={y} {tag} rgb={p}')


def skyline(img, x0, x1, step=2):
    im = Image.open(img).convert('RGB')
    for x in range(x0, x1, step):
        top = None
        for y in range(40, 600):
            if not is_sky(im.getpixel((x, y))):
                top = y
                break
        print(f'  x={x} top={top}')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'skyline':
        skyline(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]) if len(sys.argv) > 5 else 2)
        sys.exit(0)
    if cmd == 'rect':
        mask = '--sky' not in sys.argv
        a = [int(v) for v in sys.argv[3:7]]
        stats(sys.argv[2], *a, mask_sky=mask)
    elif cmd == 'crop':
        a = [int(v) for v in sys.argv[3:7]]
        z = int(sys.argv[8]) if len(sys.argv) > 8 else 4
        crop(sys.argv[2], *a, sys.argv[7], z)
    elif cmd == 'col':
        col(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
