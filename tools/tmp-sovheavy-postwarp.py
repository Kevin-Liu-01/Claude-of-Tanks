# THROWAWAY (soviet-heavy r6, 2026-08-03): predicted POST-WARP gate rows.
# Takes the curve dump (tmp-sovheavy-curvedump.mjs), maps the REFERENCE
# curves through the tank's vertex-normalize plan (gate meters), keeps the
# PROC curves (the build), and scores every row with the exact gate formula:
# registration by hull body-span midpoints + mean dy, cover both directions,
# score = 100 - 12*meanPct - 0.6*p95Pct - 1.5*coverPct. Turret rows reuse
# the hull registration (fixedReg), like the gate.
# Usage: python3 tools/tmp-sovheavy-postwarp.py is3
import json, sys, bisect

TID = sys.argv[1] if len(sys.argv) > 1 else 'is3'
PLANS = {
    'is3': dict(y=[[0,0],[2.30,2.30],[2.55,2.44],[3.135,2.47]],
                z=[[-3.418,-3.385],[3.417,3.385],[5.666,6.465]]),
    'is6b': dict(y=[[0,0],[2.344,2.50]],
                 z=[[-4.928,-5.089],[1.65,1.811],[4.935,4.011]]),
    'is7': dict(y=[[0,0],[2.447,2.60]],
                z=[[-5.046,-5.457],[1.513,1.923],[5.045,5.713]]),
    'object279': dict(y=[[0,0],[2.384,2.60]],
                      z=[[-4.855,-5.173],[1.5,1.817],[4.855,5.067]]),
    'is3_bergman': dict(y=[[0,0],[2.20,2.20],[2.48,2.42],[2.964,2.47]],
                        z=[[-4.637,-4.604],[2.199,2.166],[4.644,5.2465]]),
}
plan = PLANS[TID]

def pw(pts, v):
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    if v<=xs[0]: return ys[0]+(v-xs[0])*(ys[1]-ys[0])/(xs[1]-xs[0])
    if v>=xs[-1]: return ys[-1]+(v-xs[-1])*(ys[-1]-ys[-2])/(xs[-1]-xs[-2])
    i=bisect.bisect_right(xs,v)-1; i=min(i,len(xs)-2)
    return ys[i]+(v-xs[i])*(ys[i+1]-ys[i])/(xs[i+1]-xs[i])

d = json.load(open(f'shots/soviet-heavy-r1/curves-{TID}.json'))

def warp_ref(view, col):
    if col is None or col['world'] is None: return None
    a, t, b = col['world']
    if view == 'side':   return [pw(plan['z'], a), pw(plan['y'], t), pw(plan['y'], b)]
    if view == 'front':  return [a, pw(plan['y'], t), pw(plan['y'], b)]
    return [a, pw(plan['z'], t), pw(plan['z'], b)]   # plan: t/b are zFront/zRear

def get(view, part, warped=True):
    rows = d['rows'][f'{view}_{part}']
    ref, proc = [], []
    for col in rows:
        if col is None: ref.append(None); proc.append(None); continue
        ref.append(warp_ref(view, col) if warped else (col['world'][:] if col['world'] else None))
        proc.append(col['proc'][:] if col['proc'] else None)
    return ref, proc

def body_span(c):
    cols=[p for p in c if p]
    if not cols: return None
    rough=max(p[1] for p in cols)-min(p[2] for p in cols)
    body=[p for p in c if p and p[1]-p[2] > rough*0.12]
    arr = body if body else cols
    return (arr[0][0]+arr[-1][0])/2 if arr[0][0]<=arr[-1][0] else (arr[-1][0]+arr[0][0])/2

def span(c):
    a=b=None
    for p in c:
        if p:
            if a is None: a=p[0]
            b=p[0]
    return None if a is None else (min(a,b), max(a,b))

def score(refC, procC, norm, fixed=None):
    rs, ps = span(refC), span(procC)
    if not rs or not ps: return dict(score=0)
    dAlong = fixed['dAlong'] if fixed else (body_span(refC) or 0) - (body_span(procC) or 0)
    valid=[p for p in procC if p]
    # sort valid by along for interp
    valid.sort(key=lambda p: p[0])
    xs=[p[0] for p in valid]
    def interp(along):
        a = along - dAlong
        if a < ps[0]-0.02 or a > ps[1]+0.02: return None
        i = bisect.bisect_left(xs, a)
        if i == 0: lo = hi = valid[0]
        elif i >= len(valid): lo = hi = valid[-1]
        else: lo, hi = valid[i-1], valid[i]
        if hi[0] == lo[0]: return lo
        t=(a-lo[0])/(hi[0]-lo[0])
        return [a, lo[1]+(hi[1]-lo[1])*t, lo[2]+(hi[2]-lo[2])*t]
    if fixed: dy = fixed['dy']
    else:
        s=n=0
        for r in refC:
            if r:
                p=interp(r[0])
                if p: s += ((r[1]+r[2])-(p[1]+p[2]))/2; n+=1
        dy = s/n if n else 0
    errs=[]; only=0; either=0
    pitch=0; prev=None
    for p in refC:
        if p:
            if prev is not None: pitch=abs(p[0]-prev); break
            prev=p[0]
    margin=max(0.05, pitch*0.75)
    for p in procC:
        if not p: continue
        either+=1
        a=p[0]+dAlong
        if a < rs[0]-margin or a > rs[1]+margin: only+=1
    worst=[]
    for r in refC:
        if not r: continue
        either+=1
        p=interp(r[0])
        if not p: only+=1; continue
        e=(abs(r[1]-(p[1]+dy))+abs(r[2]-(p[2]+dy)))/2
        errs.append(e)
        worst.append((round(e,3), round(r[0],2), round(r[1],2), round(r[2],2), round(p[1]+dy,2), round(p[2]+dy,2)))
    if not errs: return dict(score=0)
    errs.sort()
    mean=sum(errs)/len(errs)/norm*100
    p95=errs[min(len(errs)-1, int(len(errs)*0.95))]/norm*100
    cover=only/either*100 if either else 0
    worst.sort(reverse=True)
    return dict(score=max(0,min(100,100-12*mean-0.6*p95-1.5*cover)),
                mean=round(mean,2), p95=round(p95,2), cover=round(cover,2),
                reg=dict(dAlong=round(dAlong,3), dy=round(dy,3)), worst=worst[:10])

# norms: height/length of the WARPED reference
sref,_ = get('side','whole')
tops=[p[1] for p in sref if p]; bots=[p[2] for p in sref if p]
H = max(tops)-min(bots)
sp = span(sref); L = sp[1]-sp[0]
out={}
regs={}
for view, norm in (('side',H),('plan',L),('front',H)):
    for part in ('hull','whole'):
        r,p = get(view, part)
        key=f'{view}_{part}'
        if part=='hull':
            out[key]=score(r,p,norm)
            regs[view]=out[key].get('reg') or dict(dAlong=0,dy=0)
        else:
            out[key]=score(r,p,norm,fixed=regs[view])
for view in ('side','plan'):
    r,p = get(view,'turret')
    out[f'{view}_turret']=score(r,p,H if view=='side' else L,fixed=regs[view])

print(f'== predicted POST-WARP rows for {TID} (norm H {H:.3f} L {L:.3f})')
for k,v in out.items():
    if 'mean' in v:
        print(f"  {k:13s} {v['score']:5.1f}  mean {v['mean']} p95 {v['p95']} cover {v['cover']} reg {v['reg']}")
    else:
        print(f"  {k:13s} {v['score']:5.1f}")
hull=min(out['side_hull']['score'],out['plan_hull']['score'],out['front_hull']['score'])
whole=min(out['side_whole']['score'],out['plan_whole']['score'],out['front_whole']['score'])
tur=min(out['side_turret']['score'],out['plan_turret']['score'])
print(f'  --> hullCurves {hull:.1f} wholeCurves {whole:.1f} turretCurves {tur:.1f}')
for k in ('side_hull','side_whole','side_turret','plan_turret'):
    v=out[k]
    if 'worst' in v:
        print(f'  worst {k}:')
        for w in v['worst'][:6]: print('    err',w)
