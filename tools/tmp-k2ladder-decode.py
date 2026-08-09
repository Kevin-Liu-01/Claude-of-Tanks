# TEMP (k2 90-ladder): decode tmp-trio-geodump output into world-frame
# worst-column attributions, replicating the gate's curveScore registration.
# DIAGNOSIS ONLY. Usage: python3 tools/tmp-k2ladder-decode.py <dump.json> [view]
import json, sys, math

dump = json.load(open(sys.argv[1]))
d = dump['k2']
cams = d['cams']
cv = d['curves']

def span(c):
    a = b = None
    for p in c:
        if p:
            if a is None: a = p[0]
            b = p[0]
    return None if a is None else (a, b)

def body_span(c):
    cols = [p for p in c if p]
    if not cols: return None
    rough = max(p[1] for p in cols) - min(p[2] for p in cols)
    a = b = None
    for p in c:
        if p and p[1] - p[2] > rough * 0.12:
            if a is None: a = p[0]
            b = p[0]
    return None if a is None else (a, b)

def curve_score(refC, procC, norm, fixed=None):
    rs, ps = span(refC), span(procC)
    rsB, psB = body_span(refC) or rs, body_span(procC) or ps
    dAlong = fixed['dAlong'] if fixed else (rsB[0]+rsB[1])/2 - (psB[0]+psB[1])/2
    valid = [p for p in procC if p]
    def interp(along):
        a = along - dAlong
        if a < ps[0]-0.02 or a > ps[1]+0.02: return None
        lo = hi = None
        for p in valid:
            if p[0] <= a and (lo is None or p[0] > lo[0]): lo = p
            if p[0] >= a and (hi is None or p[0] < hi[0]): hi = p
        if hi is None and lo and a-lo[0] <= 0.02: return (a, lo[1], lo[2])
        if lo is None and hi and hi[0]-a <= 0.02: return (a, hi[1], hi[2])
        if lo is None or hi is None: return None
        if hi[0] == lo[0]: return lo
        t = (a-lo[0])/(hi[0]-lo[0])
        return (a, lo[1]+(hi[1]-lo[1])*t, lo[2]+(hi[2]-lo[2])*t)
    if fixed: dy = fixed['dy']
    else:
        s = n = 0
        for r in refC:
            if r:
                p = interp(r[0])
                if p: s += ((r[1]+r[2])-(p[1]+p[2]))/2; n += 1
        dy = s/n if n else 0
    errs, cols = [], []
    only = either = 0
    missing = []
    pitch = 0; prev = None
    for p in refC:
        if p:
            if prev is not None: pitch = abs(p[0]-prev); break
            prev = p[0]
    margin = max(0.05, pitch*0.75)
    for p in procC:
        if not p: continue
        either += 1
        a = p[0]+dAlong
        if a < rs[0]-margin or a > rs[1]+margin:
            only += 1; missing.append(('proc-only', a))
    for r in refC:
        if not r: continue
        either += 1
        p = interp(r[0])
        if p is None:
            only += 1; missing.append(('ref-only', r[0])); continue
        e = (abs(r[1]-(p[1]+dy)) + abs(r[2]-(p[2]+dy)))/2
        errs.append(e)
        cols.append(dict(at=r[0], refTop=r[1], refBot=r[2], procTop=p[1]+dy, procBot=p[2]+dy, err=e))
    if not errs: return None
    errs.sort()
    mean = sum(errs)/len(errs)/norm*100
    p95 = errs[min(len(errs)-1, int(len(errs)*0.95))]/norm*100
    cover = only/either*100 if either else 0
    score = max(0, min(100, 100 - 12*mean - 0.6*p95 - 1.5*cover))
    return dict(score=score, mean=mean, p95=p95, cover=cover, dAlong=dAlong, dy=dy, cols=cols, nOnly=only, missing=missing)

# world decode helpers: at (cam x) -> world along axis; cam y -> world vertical
def decoder(view):
    cam = cams[view]
    right, up, pos = cam['right'], cam['up'], cam['pos']
    # camera center = lookAt center = pos - dir*60; but along axes: world point
    # p maps to cam-frame ( (p-center)·right, (p-center)·up ). center = pos - 60*dir
    # dir = normalized axis. side:(1,0,0) plan:(0,1,0) front:(0,0,1)
    axis = dict(side=(1,0,0), plan=(0,1,0), front=(0,0,1))[view]
    center = [pos[i] - 60*axis[i] for i in range(3)]
    def at_to_world(at):
        # world coordinate along the dominant axis of 'right'
        i = max(range(3), key=lambda k: abs(right[k]))
        return center[i] + right[i]*at, 'xyz'[i]
    def y_to_world(v):
        i = max(range(3), key=lambda k: abs(up[k]))
        return center[i] + up[i]*v, 'xyz'[i]
    return at_to_world, y_to_world, center

views = [sys.argv[2]] if len(sys.argv) > 2 else ['side', 'plan', 'front']
box_h = None
for view in views:
    a2w, y2w, center = decoder(view)
    norm = None
    # norms: side/front = ref height, plan = ref length (visible box) — use curve extents as proxy
    refW = [p for p in cv[f'{view}_whole_ref'] if p]
    if view == 'plan':
        norm = 10.723  # length: from gate dims (refBox z size) — stable enough for attribution
    else:
        norm = 4.585   # height
    hull = curve_score(cv[f'{view}_hull_ref'], cv[f'{view}_hull_proc'], norm)
    whole = curve_score(cv[f'{view}_whole_ref'], cv[f'{view}_whole_proc'], norm,
                        dict(dAlong=hull['dAlong'], dy=hull['dy']))
    rows = [('hull', hull), ('whole', whole)]
    if view in ('side', 'plan'):
        tr = cv.get(f'{view}_turret_ref'); tp = cv.get(f'{view}_turret_proc')
        if tr and tp:
            # gate trims turret to hull span +-0.6 — replicate
            hs_r = span(cv[f'{view}_hull_ref']); hs_p = span(cv[f'{view}_hull_proc'])
            trr = [p if (p and hs_r and hs_r[0]-0.6 <= p[0] <= hs_r[1]+0.6) else None for p in tr]
            tpp = [p if (p and hs_p and hs_p[0]-0.6 <= p[0] <= hs_p[1]+0.6) else None for p in tp]
            t = curve_score(trr, tpp, norm, dict(dAlong=hull['dAlong'], dy=hull['dy']))
            if t: rows.append(('turret', t))
    for name, r in rows:
        print(f"\n== {view}_{name}: score {r['score']:.1f} mean {r['mean']:.2f} p95 {r['p95']:.2f} "
              f"cover {r['cover']:.2f} (dAlong {r['dAlong']:.3f} dy {r['dy']:.3f}, onlyOne {r['nOnly']})")
        for kind, at in r['missing']:
            wa, ax = a2w(at)
            print(f"  {kind:9s} {ax}={wa:+7.2f}")
        cols = sorted(r['cols'], key=lambda c: -c['err'])[:40]
        for c in cols:
            w_at, ax = a2w(c['at'])
            rT, ay = y2w(c['refTop']); rB, _ = y2w(c['refBot'])
            pT, _ = y2w(c['procTop']); pB, _ = y2w(c['procBot'])
            print(f"  {ax}={w_at:+7.2f}  ref {ay}[{rB:+5.2f}..{rT:+5.2f}]  proc {ay}[{pB:+5.2f}..{pT:+5.2f}]  err {c['err']:.3f}")

# stations
st = d['stations']
print(f"\n== stations (refZR {st['refZR']} procZR {st['procZR']})")
print(f"   refMinY {st['refMinY']:.3f} procMinY {st['procMinY']:.3f}")
for row in st['rows']:
    r, p = row.get('r'), row.get('p')
    if not r or not p: print(f"  st{row['i']}: MISSING one side"); continue
    wPct = abs(r['w']-p['w'])/max(r['w'],0.2)*100
    topPct = abs((r['top']-st['refMinY'])-(p['top']-st['procMinY']))/4.585*100
    print(f"  st{row['i']:2d} z[{r['z0']:+5.2f}..{r['z1']:+5.2f}] refW {r['w']:.2f} procW {p['w']:.2f} wPct {wPct:5.2f} | "
          f"refTop {r['top']:.2f} procTop {p['top']:.2f} topPct {topPct:5.2f}")
