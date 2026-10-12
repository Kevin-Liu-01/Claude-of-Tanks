#!/usr/bin/env python3
"""tganal.py <dir> <tag> : per toggle, per page and per label: on - off (ms) of the whole frame (upscale checkpoint) and
the cumulative through the scene pass, med and p25 over each block's frames; plus CPU frame."""
import json, sys, glob, os, statistics as st, collections
d, tag = sys.argv[1:3]
rows = collections.defaultdict(list)
for f in sorted(glob.glob(f'{d}/{tag}-*-s*-*.json')):
    j = json.load(open(f))
    if j.get('failed') or j.get('void'):
        print('SKIP', os.path.basename(f), (j.get('failed') or j.get('void'))[:200]); continue
    for s in j['samples']:
        bl = s.get('blocks') or []
        groups = collections.defaultdict(lambda: {'on': [], 'off': [], 'sw': []})
        for b in bl:
            sm = b['summary']
            pf = {p['label']: p for p in (sm.get('prefix') or [])}
            rec = {k: (pf.get(c, {}).get(stat)) for k, (c, stat) in
                   {'whole_med': ('upscale', 'med'), 'whole_p25': ('upscale', 'p25'), 'scene_med': ('scene', 'med'),
                    'scene_p25': ('scene', 'p25'), 'shadow_med': ('shadow', 'med')}.items()}
            rec['cpu'] = sm['cpuFrame']['med']
            g = groups[(b.get('toggle') or j.get('toggle'), b.get('round', 0))]
            g[b['side']].append(rec); g['sw'].append(b.get('switched'))
        for (tog, rnd), g in groups.items():
            if not g['on'] or not g['off']: continue
            delta = {k: st.mean([r[k] for r in g['on'] if r[k] is not None]) - st.mean([r[k] for r in g['off'] if r[k] is not None])
                     for k in g['on'][0] if all(r[k] is not None for r in g['on'] + g['off'])}
            rows[(s['view'], tog, j['label'])].append(delta)
            print(f"{os.path.basename(f)[:34]:34} {s['view']:11} {tog:13} r{rnd} " + ' '.join(f"{k}={v:+.2f}" for k, v in delta.items())
                  + f"  sw={json.dumps(g['sw'][0])[:60]}")
print()
for k in sorted(rows):
    ds = rows[k]
    keys = ds[0].keys()
    def ms(key):
        v = [x[key] for x in ds]
        return f"{st.mean(v):+.2f}" + (f"±{st.stdev(v)/len(v)**0.5:.2f}" if len(v) > 1 else '')
    print(f"{k[0]:11} {k[1]:13} {k[2]:8} n={len(ds)} " + ' '.join(f"{key}={ms(key)}" for key in keys))
