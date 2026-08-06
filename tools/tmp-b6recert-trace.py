# TEMP (chieftain5 §B6 re-cert critic): trace the track-region silhouette
# BOTTOM line in the PROCEDURAL panel of an official critic pair render
# (view-left / view-right), print per-column bottoms across the hull span,
# and fit the front approach / rear departure ramp angles in image space.
# Usage: python3 tools/tmp-b6recert-trace.py <pair.png> [label]
# Mask method per BUILD-STANDARD §D: bg 0x151b20, |px-bg| maxch <= 13.
import sys
from PIL import Image
import numpy as np

BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)

def bottoms(img, x0, x1):
    a = np.asarray(img.convert('RGB'), dtype=np.int16)
    h, w, _ = a.shape
    fg = (np.abs(a - BG).max(axis=2) > 13)
    out = []
    for x in range(x0, x1):
        col = np.nonzero(fg[:, x])[0]
        # ignore the header text rows (y<30)
        col = col[col > 30]
        out.append((x, int(col.max()) if col.size else -1, int(col.min()) if col.size else -1))
    return out

def main():
    path = sys.argv[1]
    label = sys.argv[2] if len(sys.argv) > 2 else path
    img = Image.open(path)
    w, h = img.size
    x0, x1 = (w // 2, w) if w >= 1200 else (0, w)  # proc panel = right half
    rows = bottoms(img, x0, x1)
    xs = [r[0] for r in rows if r[1] > 0]
    bs = {r[0]: r[1] for r in rows if r[1] > 0}
    if not xs:
        print(f'{label}: no foreground found')
        return
    lo, hi = min(xs), max(xs)
    ymax = max(bs.values())  # ground line (lowest silhouette pixel)
    ground = [x for x in xs if bs[x] >= ymax - 2]
    g0, g1 = min(ground), max(ground)
    print(f'{label}: proc-panel fg x {lo}..{hi}, ground line y={ymax}, ground run x {g0}..{g1}')
    # front/rear span profiles: print every 4px from silhouette end to 40px
    # past the ground-run end on both sides
    def profile(side):
        if side == 'A':  # low-x end
            span = range(lo, min(g0 + 12, hi), 3)
        else:
            span = range(max(g1 - 12, lo), hi + 1, 3)
        pts = [(x, bs[x]) for x in span if x in bs]
        return pts
    for side in ('A', 'B'):
        pts = profile(side)
        tag = 'lowX-end' if side == 'A' else 'highX-end'
        print(f'  {tag}: ' + ' '.join(f'({x},{y})' for x, y in pts))
        # ramp fit: from the end of ground run to the extreme silhouette end,
        # use the monotonic rise of the bottom line
        if side == 'A':
            seg = [(x, bs[x]) for x in range(lo, g0 + 1) if x in bs]
        else:
            seg = [(x, bs[x]) for x in range(g1, hi + 1) if x in bs]
        if len(seg) >= 6:
            xa = np.array([p[0] for p in seg], dtype=float)
            ya = np.array([p[1] for p in seg], dtype=float)
            # restrict to the rising part (within 60px above ground)
            keep = ya > ymax - 60
            if keep.sum() >= 6:
                m, c = np.polyfit(xa[keep], ya[keep], 1)
                import math
                ang = math.degrees(math.atan(abs(m)))
                rise = ymax - ya[keep].min()
                print(f'  {tag} ramp fit: slope {m:+.3f} px/px -> {ang:.1f} deg (image), rise {rise:.0f}px over {keep.sum()}cols')
    # parallelogram detector: how far does the ground-level line reach toward
    # each silhouette end? (distance end-to-groundrun)
    print(f'  front/rear standoff: lowX {g0 - lo}px, highX {hi - g1}px '
          f'(0-6px standoff at an end = band curls to ground there = parallelogram read)')

if __name__ == '__main__':
    main()
