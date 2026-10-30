# Lane tool (envelope-honesty-264): the builder lines whose moved parts change the look on the final build, per id.
#  - decal carriers: a base marking seat (insignia/designation) lying on a part the census flagged on the base (and the
#    lane moved): the marking solver seats only on the primary turret/hull mesh, so the decal would move.
#  - hull side setters: a flagged hull part standing past the lane's narrower hull box in x (the turret ring is a hull
#    module the anatomy rescales with the hull width; the drawn race, collar and seat follow it).
#   python3 keep-sites.py <ids> [--ring=<ids with a ring change>]
import json, os, re, subprocess, sys
E = os.path.expanduser('~/cot-lanes/envelope-honesty-264-evidence'); lane = os.path.expanduser('~/cot-lanes/envelope-honesty-264')
ids = sys.argv[1].split(','); ring = set(next((a[7:] for a in sys.argv if a.startswith('--ring=')), '').split(','))
census = {r['id']: r for r in map(json.loads, open(f'{E}/census-i263/all.jsonl'))}
final = {r['id']: r for r in map(json.loads, open(f'{E}/census-final/all.jsonl'))}
def show(rev, path):
    return subprocess.run(['git', '-C', lane, 'show', f'{rev}:{path}'], capture_output=True, text=True).stdout
def marking_seats(rev):
    out = {}
    names = subprocess.run(['git', '-C', lane, 'ls-tree', '--name-only', f'{rev}:src/vehicles/vehicleMarkingSeatGroups'], capture_output=True, text=True).stdout.split()
    for n in names:
        t = show(rev, f'src/vehicles/vehicleMarkingSeatGroups/{n}')
        a = t.find('{', t.find('Object.freeze(')); b = t.rfind('}')
        try: out.update(json.loads(t[a:b + 1]))
        except Exception as e: print('parse', n, e, file=sys.stderr)
    return out
def anatomy(rev):
    out = {}
    names = subprocess.run(['git', '-C', lane, 'ls-tree', '--name-only', f'{rev}:src/vehicles/combatAnatomyGroups'], capture_output=True, text=True).stdout.split()
    for n in names:
        t = show(rev, f'src/vehicles/combatAnatomyGroups/{n}')
        if 'Object.freeze(' in t: out.update(json.loads(t[t.index('Object.freeze(') + 14:t.rindex(');')]))
    return out
MB, MA = marking_seats('a77e60e26b'), marking_seats('HEAD')
AA = anatomy('HEAD')
tol = 0.02
def contains(part, p):
    return all(abs(p[k] - part['at'][k]) <= part['dims'][k] / 2 + tol for k in range(3))
keep = {}
for i in ids:
    base = census.get(i, {})
    fin = final.get(i, {})
    finsites = {(f, tuple(q['at']), tuple(q['dims'])) for f in ('turret', 'hull') for q in (fin.get(f) or {}).get('flagged', [])}
    moved = lambda f: [q for q in (base.get(f) or {}).get('flagged', []) if (f, tuple(q['at']), tuple(q['dims'])) not in finsites]
    ba, aa = MB.get(i, {}).get('seats', []), MA.get(i, {}).get('seats', [])
    for s0, s1 in zip(ba, aa):
        if s0 == s1: continue
        frame = s0['parent']
        hits = [q for q in moved(frame) if contains(q, s0['pos'])]
        for q in hits: keep.setdefault(i, set()).add((frame, q['site'], q.get('caller'), f"decal {s0['kind']} at {s0['pos']}"))
        if not hits: keep.setdefault(i, set()).add((frame, '?', None, f"decal {s0['kind']} at {s0['pos']} moved to {s1['pos']}: no moved part under it"))
    if len(ba) != len(aa): keep.setdefault(i, set()).add(('?', '?', None, f'seat count {len(ba)} -> {len(aa)}'))
    if i in ring and AA.get(i, {}).get('hull'):
        half = (AA[i]['hull']['max'][0] - AA[i]['hull']['min'][0]) / 2
        cx = (AA[i]['hull']['max'][0] + AA[i]['hull']['min'][0]) / 2
        for q in moved('hull'):
            if abs(q['at'][0] - cx) + q['dims'][0] / 2 > half + 0.001:
                keep.setdefault(i, set()).add(('hull', q['site'], q.get('caller'), f"side setter at x {q['at'][0]} dims {q['dims']}"))
for i in ids:
    rows = sorted(keep.get(i, []), key=lambda r: (r[0], r[1]))
    print(f'== {i}: {len(rows)}')
    seen = set()
    for f, site, caller, why in rows:
        k = (f, site, caller, why.split(' at ')[0])
        if k in seen: continue
        seen.add(k); print(f'   {f} {site} <- {caller}: {why}')
