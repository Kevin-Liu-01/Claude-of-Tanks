#!/usr/bin/env python3
# tmp-ru-ceilings.py — per-id ACHIEVABLE score ceilings for the russia family.
# Simulates a build that tracks the reference curves EXACTLY except every
# silhouette top is clamped to the published-height dims ceiling
# (pub*1.0225 with the whole dims grace spent on heightM), then scores the
# clamped curve against the raw ref curve with the gate formula. This is the
# oracle-stylization ceiling: no build can beat it while dims >= 90.
import json, os, sys

S = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/worldtrace'
DIMS = {
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

def cam_cols(curve, view):
    out = []
    for p in curve:
        if p is None: out.append(None); continue
        T, B = p
        if view == 'side': out.append((-T[2], T[1], B[1]))
        elif view == 'plan': out.append((T[0], -T[2], -B[2]))
        else: out.append((T[0], T[1], B[1]))
    return out

def span(c):
    xs = [p[0] for p in c if p]
    return (min(xs), max(xs)) if xs else None

def trim_to_hull(c, hullC, m=0.6):
    sp = span(hullC)
    if not sp: return c
    return [None if (p and (p[0] < sp[0] - m or p[0] > sp[1] + m)) else p for p in c]

def score_clamped(refC, norm, ceil_y):
    # proc = ref with tops clamped at ceil_y (bots kept). err per gate.
    errs = []
    for r in refC:
        if not r: continue
        e = max(0, r[1] - ceil_y) / 2  # (|dTop|+|dBot|)/2, dBot=0
        errs.append(e)
    if not errs: return 100, 0, 0
    errs.sort()
    mean = sum(errs) / len(errs) / norm * 100
    p95 = errs[min(len(errs) - 1, int(len(errs) * 0.95))] / norm * 100
    return max(0, min(100, 100 - 12 * mean - 0.6 * p95)), round(mean, 2), round(p95, 2)

def main():
    print(f"{'id':14s} {'refRoof':>7s} {'ceil':>5s} | side_hull side_whole side_turret front_whole ~stations")
    for tid, (hL, oL, wM, hM) in DIMS.items():
        d = json.load(open(os.path.join(S, f'{tid}.json')))
        sH = cam_cols(d['side']['ref_hull'], 'side')
        sW = cam_cols(d['side']['ref_whole'], 'side')
        sT = trim_to_hull(cam_cols(d['side']['ref_turret'], 'side'), sH)
        fW = cam_cols(d['front']['ref_whole'], 'front')
        cols = [p for p in sW if p]
        height = max(p[1] for p in cols) - min(p[2] for p in cols)
        bot = min(p[2] for p in cols)
        ceil_y = bot + hM * 1.0225
        # ref roof: p95 of turret col tops
        tt = sorted(p[1] for p in sT if p)
        roof = tt[int(len(tt) * 0.9)] if tt else 0
        sh = score_clamped(sH, height, ceil_y)
        sw = score_clamped(sW, height, ceil_y)
        st = score_clamped(sT, height, ceil_y)
        fw = score_clamped(fW, height, ceil_y)
        # stations: topPct per turret slice ~ (refRoof-ceil)/height; 14 slices,
        # turret ~4-5 slices, drop 2 worst -> ~3 count
        sl_err = max(0, roof - ceil_y) / height * 100
        stations = max(0, 100 - 10 * (3 * sl_err / 12))
        print(f"{tid:14s} {roof:7.2f} {ceil_y:5.2f} |   {sh[0]:5.1f}     {sw[0]:5.1f}      {st[0]:5.1f}      {fw[0]:5.1f}      {stations:5.1f}")

main()
