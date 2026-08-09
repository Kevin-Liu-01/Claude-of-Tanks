# TEMP (k2 90-ladder): decode docs/geometry-gate/k2.json worst columns to
# world coordinates using the camera frames captured by tmp-trio-geodump.
# DIAGNOSIS ONLY. Usage: python3 tools/tmp-k2ladder-receipt.py <dump.json> [<k2.json>]
import json, sys

dump = json.load(open(sys.argv[1]))['k2']
rec = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'docs/geometry-gate/k2.json'))
cams = dump['cams']

def decoder(view):
    cam = cams[view]
    right, up, pos = cam['right'], cam['up'], cam['pos']
    axis = dict(side=(1,0,0), plan=(0,1,0), front=(0,0,1))[view]
    center = [pos[i] - 60*axis[i] for i in range(3)]
    def a2w(at):
        i = max(range(3), key=lambda k: abs(right[k]))
        return center[i] + right[i]*at, 'xyz'[i]
    def v2w(v):
        i = max(range(3), key=lambda k: abs(up[k]))
        return center[i] + up[i]*v, 'xyz'[i]
    return a2w, v2w

rows = [(k, v) for k, v in rec['curveRows'].items()] + \
       [(f'turret_{k}', v) for k, v in rec.get('turretRows', {}).items()]
for name, row in rows:
    view = name.split('_')[0] if not name.startswith('turret') else name.split('_')[1]
    if 'worst' not in row: continue
    a2w, v2w = decoder(view)
    reg = row.get('reg', {})
    print(f"\n== {name}: score {row['score']:.1f} mean {row['meanPct']} p95 {row['p95Pct']} cover {row['coverPct']} reg {reg}")
    for c in row['worst']:
        wa, ax = a2w(c['at'])
        rT, ay = v2w(c['refTop']); rB, _ = v2w(c['refBot'])
        pT, _ = v2w(c['procTop']); pB, _ = v2w(c['procBot'])
        # ref frame -> build frame: along axis shift by dAlong in the 'at' axis
        d = reg.get('dAlong', 0)
        wb, _ = a2w(c['at'] - d)  # proc column position in ITS OWN frame
        print(f"  ref@{ax}{wa:+7.2f} (build@{ax}{wb:+7.2f})  ref {ay}[{min(rB,rT):+5.2f}..{max(rB,rT):+5.2f}]  "
              f"proc {ay}[{min(pB,pT):+5.2f}..{max(pB,pT):+5.2f}]  err {c['errM']:.3f}")
