#!/usr/bin/env python3
"""slabprof.py <capture dir> <spec> <view> [dists=a,b,c]: luminance profiles along ground lines in the hull's frame (projected
with the pose's recorded root and camera matrices): (1) behind the rear plate along the right lane, (2) beside the right track
outward near its rear, (3) beside it at mid-run. Prints per dist the profile, the darkness against open turf and the 10-90 %
edge width (cm)."""
import json, sys
import numpy as np
from PIL import Image
D, spec, view = sys.argv[1:4]
dists = (sys.argv[4] if len(sys.argv) > 4 else 'a,b,c').split(',')
rec = json.load(open(f'{D}/lab4.json'))
def frame(dist):
    for f in rec['frames']:
        if f['dist'] == dist and f['spec'] == spec and f['view'] == view and f['variant'] == 'full': return f
def mat(e): return np.array(e, dtype=np.float64).reshape(4, 4).T   # three.js column-major
def project(f, pts):
    P = f['pose']; M = mat(P['ground']['matrix']); C = mat(P['proj']['camMatrix']); Pr = mat(P['proj']['projMatrix'])
    W, H = P['proj']['width'], P['proj']['height']
    V = np.linalg.inv(C); out = []
    for x, y, z in pts:
        w = M @ np.array([x, y, z, 1.0]); c = Pr @ (V @ w)
        out.append(((c[0] / c[3] + 1) * 0.5 * W, (1 - c[1] / c[3]) * 0.5 * H))
    return out
def lum(img, uv):
    a = img; vals = []
    for u, v in uv:
        x, y = int(round(u)), int(round(v))
        if 1 <= x < a.shape[1] - 1 and 1 <= y < a.shape[0] - 1: vals.append(float(a[y - 1:y + 2, x - 1:x + 2].mean()))
        else: vals.append(float('nan'))
    return np.array(vals)
def edge(t, l):
    ok = ~np.isnan(l)
    if ok.sum() < 5: return None
    t, l = t[ok], l[ok]
    lo, hi = np.nanpercentile(l, 5), np.nanpercentile(l, 95)
    if hi - lo < 3: return None
    a, b = lo + 0.1 * (hi - lo), lo + 0.9 * (hi - lo)
    i0 = np.argmax(l >= a); i1 = np.argmax(l >= b)
    return abs(t[i1] - t[i0]) * 100
f0 = frame(dists[0]); S = f0['pose']['ground'].get('shape')
if S is None:
    # the contact rectangle the press used (the run's ground footprint): its half width is the outer face, its half length the
    # ground run's end
    pi = f0['pose']['pressInfo']; hw, hl = pi['halfWidth'], pi['halfLength']
    S = {'xi': hw - 0.6, 'xo': hw, 'y0': 0.0, 'fz0': -hl - 0.6, 'cz0': -hl, 'cz1': hl}
lane = 0.5 * (S['xi'] + S['xo']); y0 = S['y0']
lines = {
  'behind the run, right lane (z from its end out)': [(lane, y0, S['cz0'] + 0.2 - k * 0.02) for k in range(110)],
  'beside the right track near its rear (x out)': [(S['xo'] - 0.05 + k * 0.02, y0, S['cz0'] + 0.4) for k in range(80)],
  'beside the right track mid-run (x out)': [(S['xo'] - 0.05 + k * 0.02, y0, 0.5 * (S['cz0'] + S['cz1'])) for k in range(80)],
}
for name, pts in lines.items():
    print(f'== {name}')
    t = np.arange(len(pts)) * 0.02
    for d in dists:
        f = frame(d)
        if not f: continue
        img = np.asarray(Image.open(f'{D}/{f["file"]}').convert('RGB'), dtype=np.float32) @ [0.2126, 0.7152, 0.0722]
        l = lum(img, project(f, pts))
        far = np.nanmedian(l[-15:]); near = np.nanmedian(l[3:10])
        e = edge(t, l)
        print(f'  {d}: near {near:5.1f} far {far:5.1f} ratio {near / max(far, 1):.2f} edge10-90 {e if e is None else round(e)} cm | ' + ' '.join('nan' if np.isnan(v) else str(int(v)) for v in l[::5]))
