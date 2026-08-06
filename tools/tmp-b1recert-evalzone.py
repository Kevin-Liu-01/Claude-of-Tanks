#!/usr/bin/env python3
# b1recert: pull visual-evaluator matched/unmatched edges in the turret-front zone
# (world y 1.6..2.6, z 1.8..3.3) for the changed views + the digest worst edges.
import json

r = json.load(open('shots/visual-eval-kf51/report.json'))
print('camoSeed', r['camoSeed'], '| rigParity', json.dumps(r.get('rigParity'))[:200])

ZONE_Y = (1.55, 2.65)
ZONE_Z = (1.75, 3.35)

def inzone(mw):
    x, y, z = mw
    return ZONE_Y[0] <= y <= ZONE_Y[1] and ZONE_Z[0] <= z <= ZONE_Z[1]

for vname in ['front', 'frontleft', 'frontright', 'left', 'right', 'rearleft', 'rearright', 'close-front', 'hero-frontleft', 'hero-toptilt']:
    v = r['views'].get(vname)
    if not v:
        continue
    e = v.get('edges', {})
    rows = []
    for m in e.get('matched', []):
        if inzone(m['midWorld']):
            rows.append(('MATCH', m['dAngleDeg'], m['noiseDeg'], m['lenM'], m['midWorld'], m['desc'], m['flagged']))
    for tag, arr in (('REFONLY', e.get('refOnly', [])), ('PROCONLY', e.get('procOnly', []))):
        for m in arr:
            if inzone(m['midWorld']):
                rows.append((tag, m.get('angleDeg'), None, m['lenM'], m['midWorld'], m.get('desc', ''), None))
    rows.sort(key=lambda t: -(t[3] or 0))
    print(f'== {vname}: {len(rows)} zone edges')
    for t in rows[:12]:
        mw = '[' + ','.join(f'{c:.2f}' for c in t[4]) + ']'
        if t[0] == 'MATCH':
            print(f"   {t[0]} dA {t[1]:+.1f}deg +-{t[2]:.1f} len {t[3]:.2f}m mid {mw} {t[5]} {'FLAG' if t[6] else ''}")
        else:
            print(f"   {t[0]} a {t[1]:.1f}deg len {t[3]:.2f}m mid {mw} {t[5]}")
