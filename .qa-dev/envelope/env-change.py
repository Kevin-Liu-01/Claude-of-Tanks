# Lane tool (envelope-honesty-264): each id's calibrated combat turret and hull boxes (combatAnatomyGroups) at two
# revisions: width (x), length (z) and height (y), and the change in centimetres.
#   python3 env-change.py <baseRev> <rev> <ids-file-or-list>
import json, subprocess, sys, os
base, rev, ids_arg = sys.argv[1:4]
ids = [l.split('\t')[0].strip() for l in open(ids_arg)] if os.path.exists(ids_arg) else ids_arg.split(',')
lane = os.path.expanduser('~/cot-lanes/envelope-honesty-264')
def cal(r):
    names = subprocess.run(['git', '-C', lane, 'ls-tree', '--name-only', f'{r}:src/vehicles/combatAnatomyGroups'], capture_output=True, text=True, check=True).stdout.split()
    out = {}
    for n in names:
        if not n.endswith('.generated.ts'): continue
        t = subprocess.run(['git', '-C', lane, 'show', f'{r}:src/vehicles/combatAnatomyGroups/{n}'], capture_output=True, text=True, check=True).stdout
        a, b = t.index('Object.freeze(') + 14, t.rindex(');')
        out.update(json.loads(t[a:b]))
    return out
A, B = cal(base), cal(rev)
dims = lambda box: [round(box['max'][k] - box['min'][k], 3) for k in (0, 2, 1)]
print('id | frame | before W x L x H (m) | after | change cm (W, L, H)')
for i in ids:
    if not i: continue
    for f in ('turret', 'hull'):
        a, b = A.get(i, {}).get(f), B.get(i, {}).get(f)
        if not a or not b: print(f'{i} | {f} | missing'); continue
        da, db = dims(a), dims(b)
        if da == db: continue
        print(f"{i} | {f} | {' x '.join(map(str, da))} | {' x '.join(map(str, db))} | {', '.join(f'{(y - x) * 100:+.1f}' for x, y in zip(da, db))}")
