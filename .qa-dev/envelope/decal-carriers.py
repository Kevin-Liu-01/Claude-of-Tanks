# Lane tool (envelope-honesty-264): the moved parts under or beside each base decal (insignia/designation), with their
# builder lines: the marking solver seats and clips decals on the primary turret/hull mesh only.
#   python3 decal-carriers.py <ids>      (needs part-sites/base and part-sites/lane rows for each id)
import json, os, subprocess, sys
E = os.path.expanduser('~/cot-lanes/envelope-honesty-264-evidence'); lane = os.path.expanduser('~/cot-lanes/envelope-honesty-264')
P = f'{E}/part-sites'
def seats(rev):
    out = {}
    names = subprocess.run(['git', '-C', lane, 'ls-tree', '--name-only', f'{rev}:src/vehicles/vehicleMarkingSeatGroups'], capture_output=True, text=True).stdout.split()
    for n in names:
        t = subprocess.run(['git', '-C', lane, 'show', f'{rev}:src/vehicles/vehicleMarkingSeatGroups/{n}'], capture_output=True, text=True).stdout
        a = t.find('{', t.find('Object.freeze(')); b = t.rfind('}')
        try: out.update(json.loads(t[a:b + 1]))
        except Exception: pass
    return out
S = seats('a77e60e26b')
PRIMARY = {'turret', 'hull'}
for i in sys.argv[1].split(','):
    try: B, L = json.load(open(f'{P}/base/{i}.json')), json.load(open(f'{P}/lane/{i}.json'))
    except FileNotFoundError: print(f'== {i}: no part sites yet'); continue
    k = lambda r: (r['parent'], tuple(round(v, 3) for v in r['min'] + r['max']))
    lb = {}
    for r in L: lb.setdefault(k(r), []).append(r['bucket'])
    moved = []
    for r in B:
        if r['bucket'] in PRIMARY:
            nb = lb.get(k(r), [])
            if nb and r['bucket'] not in nb: moved.append({**r, 'to': nb[0]})
    out = set()
    for s in S.get(i, {}).get('seats', []):
        parent = {'turret': 'turretG', 'hull': 'hullG'}[s['parent']]
        rad = s['size'] * 0.75 + 0.03
        for m in moved:
            if m['parent'] != parent: continue
            d2 = sum(max(m['min'][a] - s['pos'][a], 0, s['pos'][a] - m['max'][a]) ** 2 for a in range(3))
            if d2 <= rad * rad: out.add((m['site'], m['caller'], m['to'], s['kind'], round(d2 ** 0.5, 3)))
    print(f'== {i}: {len(moved)} moved parts, {len(out)} near a decal')
    for site, caller, to, kind, d in sorted(out): print(f'   {site} <- {caller} -> {to}: {kind} ({d} m)')
