#!/usr/bin/env python3
# tmp-ru-oracle-trust.py — russia-family oracle trust audit (r6).
# Applies the geometry-gate's own body-extent rules to the CURRENT reference
# traces (docs/references/profiles/<id>.json) and compares against published
# spec dims: per-dim % disagreement = how far curve-truth sits from dim-truth.
# Dimension analysis only (reads measured polylines, never GLB vertices).
import json, sys

IDS = {
    # id: (hullLengthM, overallLengthM, widthM, heightM)
    't90a':          (6.86, 9.53, 3.78, 2.23),
    't90a_vladimir': (6.86, 9.53, 3.78, 2.23),
    't72bu':         (6.86, 9.53, 3.78, 2.23),
    't90sm':         (6.86, 9.63, 3.78, 2.23),
    't72b_1987':     (6.67, 9.53, 3.59, 2.23),
    't72b3m':        (6.67, 9.53, 3.59, 2.23),
    'pt91m':         (6.86, 9.53, 3.59, 2.19),
    't62mv1':        (6.63, 9.34, 3.30, 2.40),
    't64bv1':        (6.54, 9.23, 3.42, 2.17),
}

def body_extent(curve):
    cols = [c for c in curve if c]
    if not cols: return None
    rough = max(c[1] for c in cols) - min(c[2] for c in cols)
    body = [c for c in cols if c[1] - c[2] > rough * 0.12]
    if not body: return None
    tops = sorted(c[1] for c in body)
    top = tops[min(len(tops) - 1, int(len(tops) * 0.95))]
    bot = min(c[2] for c in body)
    return {'h': top - bot, 'len': abs(body[-1][0] - body[0][0]),
            'z0': body[0][0], 'z1': body[-1][0], 'top': top, 'bot': bot}

def full_span(curve):
    cols = [c for c in curve if c]
    return (cols[0][0], cols[-1][0], abs(cols[-1][0] - cols[0][0])) if cols else None

def plan_width(curve, min_band=0.35):
    cols = [c for c in curve if c and (c[1] - c[2]) > min_band]
    return abs(cols[-1][0] - cols[0][0]) if cols else 0

for tid, pub in IDS.items():
    d = json.load(open(f'docs/references/profiles/{tid}.json'))
    sw, sh = d['side_whole'], d['side_hull']
    be_w, be_h = body_extent(sw), body_extent(sh)
    fs = full_span(sw)
    wid = plan_width(d['plan_whole'])
    pitch = abs(sw[1][0] - sw[0][0]) if sw[0] and sw[1] else 0
    wid += pitch  # column centers are one pitch short of physical extent
    hull_fs = full_span(sh)
    hL, oL, wM, hM = pub
    def pct(a, b): return (a - b) / b * 100
    print(f"== {tid} (frame box z {d['frame']['box']['min'][2]:.2f}..{d['frame']['box']['max'][2]:.2f}, y max {d['frame']['box']['max'][1]:.2f})")
    print(f"   whole-body: len {be_w['len']:.2f} vs hull pub {hL} ({pct(be_w['len'], hL):+.1f}%)  "
          f"h {be_w['h']:.2f} vs pub {hM} ({pct(be_w['h'], hM):+.1f}%)  span z {be_w['z0']:.2f}..{be_w['z1']:.2f} top {be_w['top']:.2f} bot {be_w['bot']:.2f}")
    print(f"   hull-mask : len {be_h['len']:.2f}  span {be_h['z0']:.2f}..{be_h['z1']:.2f}  full {hull_fs[0]:.2f}..{hull_fs[1]:.2f}  top {be_h['top']:.2f}")
    print(f"   overall   : {fs[2]:.2f} vs pub {oL} ({pct(fs[2], oL):+.1f}%)   plan width {wid:.2f} vs pub {wM} ({pct(wid, wM):+.1f}%)")
