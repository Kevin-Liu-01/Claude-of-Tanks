# TEMP (leopard shoe re-cert): visualize per-view diffs — grey candidate
# proc half with changed px painted red (t>4), plus blob clustering
# (8-connected, min 4 px) printed with bboxes so high blobs can be told
# from the wheel-line blobs. Usage:
#   python3 tools/tmp-leoshoe-recert-overlay.py <baseDir> <candDir> <view> <outPng>
import sys
from PIL import Image

T = 4

def main():
    bp, cp, view, out = sys.argv[1:5]
    a = Image.open(f'{bp}/{view}.png').convert('RGB')
    b = Image.open(f'{cp}/{view}.png').convert('RGB')
    W, H = a.size
    pa, pb = a.load(), b.load()
    x0 = W // 2
    o = Image.new('RGB', (W - x0, H))
    po = o.load()
    changed = []
    for y in range(H):
        for x in range(x0, W):
            r, g, bl = pb[x, y]
            v = (r * 299 + g * 587 + bl * 114) // 1000
            po[x - x0, y] = (v, v, v)
            ra, ga, ba = pa[x, y]
            if max(abs(ra - r), abs(ga - g), abs(ba - bl)) > T:
                po[x - x0, y] = (255, 40, 40)
                changed.append((x - x0, y))
    # blob clustering
    cs = set(changed)
    seen = set()
    blobs = []
    for p in changed:
        if p in seen:
            continue
        stack = [p]
        blob = []
        seen.add(p)
        while stack:
            q = stack.pop()
            blob.append(q)
            qx, qy = q
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (qx + dx, qy + dy)
                    if n in cs and n not in seen:
                        seen.add(n)
                        stack.append(n)
        blobs.append(blob)
    blobs.sort(key=len, reverse=True)
    for bl in blobs[:12]:
        if len(bl) < 4:
            break
        xs = [q[0] for q in bl]
        ys = [q[1] for q in bl]
        print(f'{view} blob {len(bl):5d}px x {min(xs)}..{max(xs)} y {min(ys)}..{max(ys)}')
    o.save(out)
    print(f'{view}: total {len(changed)} -> {out}')

if __name__ == '__main__':
    main()
