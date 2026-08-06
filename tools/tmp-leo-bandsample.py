#!/usr/bin/env python3
# TEMP (leo2a6 shaded-parity r4, r5: +SATURATION): pixel-sample the EXACT
# track-band element on both halves of a critic pair PNG (fleet law, now
# 3-dimensional: HUE family + LUMINANCE ratio 0.92-1.16 + SATURATION, all
# sampled ON the element being retoned, never adjacent painted parts). Usage:
#   python3 tools/tmp-leo-bandsample.py <pair.png> <label> x0 y0 x1 y1 [<label> ...]
# Rect coords are absolute pair-image pixels (ref half x<640, proc half x>=640).
# Filters out the board background (0x151b20) and near-black shadow, then
# reports median RGB, HSV hue + HSV saturation of the median (and the median
# of per-pixel saturations), and mean relative luminance.
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)

def hue_of(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0.0
    d = mx - mn
    if mx == r:
        h = (g - b) / d % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60.0

def lum(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def sat_of(r, g, b):
    mx = max(r, g, b)
    if mx == 0:
        return 0.0
    return (mx - min(r, g, b)) / mx * 100.0

def sample(im, x0, y0, x1, y1):
    px = im.load()
    keep = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y][:3]
            if abs(r - BG[0]) < 14 and abs(g - BG[1]) < 14 and abs(b - BG[2]) < 14:
                continue  # background
            if max(r, g, b) < 26:
                continue  # deep shadow / void
            keep.append((r, g, b))
    if not keep:
        return None
    keep_r = sorted(p[0] for p in keep)
    keep_g = sorted(p[1] for p in keep)
    keep_b = sorted(p[2] for p in keep)
    n = len(keep)
    med = (keep_r[n // 2], keep_g[n // 2], keep_b[n // 2])
    mean = tuple(sum(c[i] for c in keep) / n for i in range(3))
    hues = sorted(hue_of(*p) for p in keep if max(*p) - min(*p) >= 6)
    med_hue = hues[len(hues) // 2] if hues else float('nan')
    sats = sorted(sat_of(*p) for p in keep)
    return {
        'n': n, 'med': med, 'mean': mean,
        'hue_med_px': med_hue, 'hue_of_med': hue_of(*med),
        'sat_med_px': sats[len(sats) // 2], 'sat_of_med': sat_of(*med),
        'lum_mean': lum(*mean), 'lum_med': lum(*med),
    }

def main():
    path = sys.argv[1]
    im = Image.open(path).convert('RGB')
    args = sys.argv[2:]
    results = {}
    while args:
        label = args[0]
        x0, y0, x1, y1 = (int(v) for v in args[1:5])
        args = args[5:]
        s = sample(im, x0, y0, x1, y1)
        results[label] = s
        if s is None:
            print(f'{label:14s} EMPTY rect')
            continue
        print(f"{label:14s} n={s['n']:6d} medRGB=({s['med'][0]:3d},{s['med'][1]:3d},{s['med'][2]:3d}) "
              f"meanRGB=({s['mean'][0]:5.1f},{s['mean'][1]:5.1f},{s['mean'][2]:5.1f}) "
              f"hue(medpx)={s['hue_med_px']:5.1f} hue(med)={s['hue_of_med']:5.1f} "
              f"sat(medpx)={s['sat_med_px']:5.1f} sat(med)={s['sat_of_med']:5.1f} "
              f"lum(mean)={s['lum_mean']:5.1f} lum(med)={s['lum_med']:5.1f}")
    labels = list(results)
    for i in range(0, len(labels) - 1, 2):
        a, b = labels[i], labels[i + 1]
        if results[a] and results[b]:
            print(f'  ratio {a}/{b}: lum(mean) {results[a]["lum_mean"] / results[b]["lum_mean"]:.3f} '
                  f'lum(med) {results[a]["lum_med"] / results[b]["lum_med"]:.3f}')

main()
