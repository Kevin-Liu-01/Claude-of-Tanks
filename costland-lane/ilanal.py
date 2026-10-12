#!/usr/bin/env python3
"""ilanal.py <dir> <tag> : frame-interleaved toggles — per page/view/toggle: on - off GPU (ms) as the mean of the
period-8 blocks' differences (each block 4 on, 4 off) with its SE, a 10 % trimmed mean and the median difference; CPU."""
import json, sys, glob, os, statistics as st, collections
d, tag = sys.argv[1:3]
agg = collections.defaultdict(list)
def trim(v, p=0.1):
    v = sorted(v); k = int(len(v) * p); return v[k:len(v) - k] if len(v) > 2 * k else v
for f in sorted(glob.glob(f'{d}/{tag}-*-s*-*.json')):
    j = json.load(open(f))
    if j.get('failed') or j.get('void'): print('SKIP', os.path.basename(f), str(j.get('failed') or j.get('void'))[:300]); continue
    for s in j['samples']:
        for run in s.get('runs') or []:
            fr = [x for x in run['result']['frames'] if x.get('mode') == 'whole']
            sides = run['sides']
            if run['result'].get('disjointFrames'): print('DISJOINT', os.path.basename(f), run['toggle'], run['result']['disjointFrames'])
            n = min(len(fr), len(sides))
            if abs(len(fr) - len(sides)) > 2: print('ALIGN?', os.path.basename(f), run['toggle'], len(fr), len(sides))
            g = [(sides[i], fr[i]['gpuTotal'], fr[i]['cpuFrame']) for i in range(n) if fr[i].get('gpuTotal') is not None]
            blocks = []
            for b in range(0, len(g) - 7, 8):
                blk = g[b:b + 8]
                on = [x[1] for x in blk if x[0] == 1]; off = [x[1] for x in blk if x[0] == 0]
                if on and off: blocks.append(st.mean(on) - st.mean(off))
            on = [x[1] for x in g if x[0] == 1]; off = [x[1] for x in g if x[0] == 0]
            con = [x[2] for x in g if x[0] == 1]; coff = [x[2] for x in g if x[0] == 0]
            bm = st.mean(blocks); se = st.stdev(blocks) / len(blocks) ** 0.5
            tm = st.mean(trim(blocks))
            md = st.median(on) - st.median(off)
            cpu = st.mean(con) - st.mean(coff)
            key = (s['view'], run['toggle'], j['label'])
            agg[key].append((bm, se, tm, md, cpu))
            print(f"{os.path.basename(f)[:30]:30} {s['view']:11} {run['toggle']:12} n={len(g):4} gpu_on-off={bm:+.3f}±{se:.3f} trim={tm:+.3f} medΔ={md:+.3f} "
                  f"(on med {st.median(on):.2f}) cpu={cpu:+.3f}")
print()
for k in sorted(agg):
    v = agg[k]
    w = [1 / max(x[1], 1e-3) ** 2 for x in v]
    wm = sum(x[0] * wi for x, wi in zip(v, w)) / sum(w); wse = (1 / sum(w)) ** 0.5
    print(f"{k[0]:11} {k[1]:12} {k[2]:8} pages={len(v)} gpu={wm:+.3f}±{wse:.3f} (ivw) trim={st.mean(x[2] for x in v):+.3f} "
          f"medΔ={st.mean(x[3] for x in v):+.3f} cpu={st.mean(x[4] for x in v):+.3f}")
