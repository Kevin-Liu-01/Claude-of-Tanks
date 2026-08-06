#!/usr/bin/env python3
# tmp-ru-workorder.py — russia-family authoring targets from worldtrace dumps.
# Mirrors the gate's registration + scoring math (translation-only, hull
# body-span anchored) and prints per-id: estimated component scores, the ref
# hull deck/belly polylines in WORLD z, turret band, plan width course, and
# the dims-ceiling conflict summary. Reads scratchpad JSONs from
# tools/tmp-ru-worldtrace.mjs. Usage: python3 tools/tmp-ru-workorder.py t72bu [--curves]
import json, sys, os

SCRATCH = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/worldtrace'
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

def load(tid):
    return json.load(open(os.path.join(SCRATCH, f'{tid}.json')))

# curve col: [[Tx,Ty,Tz],[Bx,By,Bz]] or None. Convert to (along, top, bot)
# per view in the GATE's camera frame (so the math matches), but keep world
# accessors for printing.
def cam_cols(curve, view):
    out = []
    for p in curve:
        if p is None:
            out.append(None); continue
        T, B = p
        if view == 'side':
            out.append((-T[2], T[1], B[1]))   # along=-z (camera x), band=y
        elif view == 'plan':
            out.append((T[0], -T[2], -B[2]))  # along=x, band=-z
        else:
            out.append((T[0], T[1], B[1]))    # along=x, band=y
    return out

def span(c):
    xs = [p[0] for p in c if p]
    return (min(xs), max(xs)) if xs else None

def body_span(c):
    cols = [p for p in c if p]
    if not cols: return None
    rough = max(p[1] for p in cols) - min(p[2] for p in cols)
    xs = [p[0] for p in c if p and p[1] - p[2] > rough * 0.12]
    return (min(xs), max(xs)) if xs else None

def interp(c, a):
    valid = [p for p in c if p]
    lo = hi = None
    for p in valid:
        if p[0] <= a and (lo is None or p[0] > lo[0]): lo = p
        if p[0] >= a and (hi is None or p[0] < hi[0]): hi = p
    if lo is None or hi is None: return None
    if hi[0] == lo[0]: return lo
    t = (a - lo[0]) / (hi[0] - lo[0])
    return (a, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t)

def curve_score(refC, procC, norm, fixed=None):
    rs, ps = span(refC), span(procC)
    if not rs or not ps: return dict(score=0, mean=100, p95=100, cover=100, dAlong=0, dy=0, worst=[])
    rsB, psB = body_span(refC) or rs, body_span(procC) or ps
    dAlong = fixed[0] if fixed else (rsB[0] + rsB[1]) / 2 - (psB[0] + psB[1]) / 2
    def ip(a):
        aa = a - dAlong
        if aa < ps[0] - 0.02 or aa > ps[1] + 0.02: return None
        return interp(procC, aa)
    if fixed:
        dy = fixed[1]
    else:
        s = n = 0
        for r in refC:
            if r:
                p = ip(r[0])
                if p: s += ((r[1] + r[2]) - (p[1] + p[2])) / 2; n += 1
        dy = s / n if n else 0
    errs, cols = [], []
    only = either = 0
    pitch = 0
    prev = None
    for p in refC:
        if p:
            if prev is not None: pitch = abs(p[0] - prev); break
            prev = p[0]
    margin = max(0.05, pitch * 0.75)
    for p in procC:
        if not p: continue
        either += 1
        a = p[0] + dAlong
        if a < rs[0] - margin or a > rs[1] + margin: only += 1
    for r in refC:
        if not r: continue
        either += 1
        p = ip(r[0])
        if not p: only += 1; continue
        e = (abs(r[1] - (p[1] + dy)) + abs(r[2] - (p[2] + dy))) / 2
        errs.append(e)
        cols.append((r[0], r[1], r[2], p[1] + dy, p[2] + dy, e))
    if not errs: return dict(score=0, mean=100, p95=100, cover=100, dAlong=dAlong, dy=dy, worst=[])
    errs.sort()
    mean = sum(errs) / len(errs) / norm * 100
    p95 = errs[min(len(errs) - 1, int(len(errs) * 0.95))] / norm * 100
    cover = only / either * 100 if either else 0
    cols.sort(key=lambda c: -c[5])
    return dict(score=max(0, min(100, 100 - 12 * mean - 0.6 * p95 - 1.5 * cover)),
                mean=round(mean, 2), p95=round(p95, 2), cover=round(cover, 2),
                dAlong=round(dAlong, 3), dy=round(dy, 3), worst=cols[:12])

def trim_to_hull(c, hullC, m=0.6):
    sp = span(hullC)
    if not sp: return c
    return [None if (p and (p[0] < sp[0] - m or p[0] > sp[1] + m)) else p for p in c]

def fmt_poly(c, step=4, world_z=None):
    # print (worldZ, top, bot) rows; for side view along=-z so worldZ=-along
    rows = []
    for i, p in enumerate(c):
        if p and i % step == 0:
            a = -p[0] if world_z else p[0]
            rows.append(f'    [{a:+6.2f}, {p[1]:5.2f}, {p[2]:5.2f}]')
    return '\n'.join(rows)

def main():
    tid = sys.argv[1]
    show_curves = '--curves' in sys.argv
    d = load(tid)
    hL, oL, wM, hM = DIMS[tid]
    print(f'==== {tid} pub hull {hL} overall {oL} width {wM} height {hM} ====')
    height = None
    reg = {}
    for view in ['side', 'plan', 'front']:
        refH = cam_cols(d[view]['ref_hull'], view)
        refW = cam_cols(d[view]['ref_whole'], view)
        prcH = cam_cols(d[view]['proc_hull'], view)
        prcW = cam_cols(d[view]['proc_whole'], view)
        if view == 'side':
            cols = [p for p in refW if p]
            height = max(p[1] for p in cols) - min(p[2] for p in cols)
        norm = height if view != 'plan' else (span(refW)[1] - span(refW)[0])
        h = curve_score(refH, prcH, norm)
        reg[view] = (h['dAlong'], h['dy'])
        w = curve_score(refW, prcW, norm, fixed=reg[view])
        print(f'{view}_hull  score {h["score"]:5.1f} mean {h["mean"]:5.2f} p95 {h["p95"]:5.2f} cover {h["cover"]:5.2f} dAlong {h["dAlong"]:+.3f} dy {h["dy"]:+.3f}')
        print(f'{view}_whole score {w["score"]:5.1f} mean {w["mean"]:5.2f} p95 {w["p95"]:5.2f} cover {w["cover"]:5.2f}')
        for c in h['worst'][:5]:
            print(f'   hull worst at {c[0]:+6.2f}: ref[{c[1]:5.2f},{c[2]:5.2f}] proc[{c[3]:5.2f},{c[4]:5.2f}] err {c[5]:.3f}')
        for c in w['worst'][:5]:
            print(f'   whole worst at {c[0]:+6.2f}: ref[{c[1]:5.2f},{c[2]:5.2f}] proc[{c[3]:5.2f},{c[4]:5.2f}] err {c[5]:.3f}')
    for view in ['side', 'plan']:
        refT = trim_to_hull(cam_cols(d[view]['ref_turret'], view), cam_cols(d[view]['ref_hull'], view))
        prcT = trim_to_hull(cam_cols(d[view]['proc_turret'], view), cam_cols(d[view]['proc_hull'], view))
        norm = height if view == 'side' else (lambda s: s[1] - s[0])(span(cam_cols(d[view]['ref_whole'], view)))
        t = curve_score(refT, prcT, norm, fixed=reg[view])
        print(f'{view}_turret score {t["score"]:5.1f} mean {t["mean"]:5.2f} p95 {t["p95"]:5.2f} cover {t["cover"]:5.2f}')
        for c in t['worst'][:6]:
            print(f'   turret worst at {c[0]:+6.2f}: ref[{c[1]:5.2f},{c[2]:5.2f}] proc[{c[3]:5.2f},{c[4]:5.2f}] err {c[5]:.3f}')
    # ---- ref hull body + turret plateau summary in WORLD z ----
    refH = cam_cols(d['side']['ref_hull'], 'side')
    refW = cam_cols(d['side']['ref_whole'], 'side')
    refT = cam_cols(d['side']['ref_turret'], 'side')
    bs = body_span(refH)
    print(f'ref side hull body span (cam along) {bs[0]:+.2f}..{bs[1]:+.2f} -> world z {-bs[1]:+.2f}..{-bs[0]:+.2f} len {bs[1]-bs[0]:.2f}')
    ps = body_span(cam_cols(d['side']['proc_hull'], 'side'))
    print(f'proc side hull body span world z {-ps[1]:+.2f}..{-ps[0]:+.2f} len {ps[1]-ps[0]:.2f}')
    tt = [p for p in refT if p]
    if tt:
        tops = sorted(p[1] for p in tt)
        plateau = tops[int(len(tops) * 0.75)]
        print(f'ref turret cols {len(tt)} top max {tops[-1]:.2f} p75 {plateau:.2f} — world z {-max(p[0] for p in tt):+.2f}..{-min(p[0] for p in tt):+.2f}')
    if show_curves:
        print('-- ref side hull (worldZ, top, bot):'); print(fmt_poly(refH, 2, world_z=True))
        print('-- ref side whole:'); print(fmt_poly(refW, 2, world_z=True))
        print('-- ref side turret:'); print(fmt_poly(refT, 2, world_z=True))
        print('-- ref plan hull (x, zFwd, zAft):')
        print(fmt_poly(cam_cols(d['plan']['ref_hull'], 'plan'), 2))
        print('-- ref plan turret:')
        print(fmt_poly(cam_cols(d['plan']['ref_turret'], 'plan'), 2))
        print('-- ref front hull (x, top, bot):')
        print(fmt_poly(cam_cols(d['front']['ref_hull'], 'front'), 2))
        print('-- ref front whole:')
        print(fmt_poly(cam_cols(d['front']['ref_whole'], 'front'), 2))

main()
