# TEMP (leopard §B5 DE-FUSION round): stranded-flag adjudication census.
# From shots/leo-defuse/census-flip.json (the per-add census of the FLIPPED
# build), list every hull-bucket add with content above the ring plane that
# intersects the casting box — the per-piece truth behind any residual
# merged-bucket AABB flags (the m1a2 §B5-r2 stranded-falseflag-census
# precedent). Usage: python3 tools/tmp-leo-defuse-strandcensus.py [file]
import json, sys

f = sys.argv[1] if len(sys.argv) > 1 else 'shots/leo-defuse/census-flip.json'
d = json.load(open(f))
cast = d['partA']['castingBox']
ring = d['partA']['ringY']
M = 0.03
lo = [cast[0][0] + M, cast[0][1] + M, cast[0][2] + M]
hi = [cast[1][0] - M, cast[1][1] - M, cast[1][2] - M]
print(f"castingBox {cast} ringY {ring} (shrunk {lo}..{hi})")
print(f"official audit: stranded {len(d['partA']['stranded'])} abutting {len(d['partA']['abutting'])} dangling {len(d['partA']['dangling'])}")
for s in d['partA']['stranded']:
    print(f"  STRANDED {s['name']} ({s['parent']}) {s['matCol']} verts {s['verts']} ov {s['overlap']} box {s['box']}")

print('\nper-add hull pieces with ymax > ringY+0.02 AND casting intersection (the audit-relevant truth):')
n = 0
for h in d['partB']['hull']:
    if h['frac'] <= 0: continue
    n += 1
    print(f"  L{h['line']} {h['bucket']:12s} frac {h['frac']:.3f} box {h['box']}")
print(f'total: {n}')
print('\ndirect hull meshes with casting overlap:')
for x in d['partB']['direct']:
    if x['group'] == 'hullG' and x['frac'] > 0:
        print(f"  {x['name'] or '(unnamed)'} verts {x['verts']} frac {x['frac']} box {x['box']}")
