# t84 seat plan, corroboration leg: T-80 family prints (gen2 two-mesh
# contract, same lineage as the T-84) — measure each print's ring-deck
# plateau, casting shell rim, casting roof and top in ITS OWN gate frame
# (s = widthM_pub/width_raw, ground = min y) to establish the family's
# true hull-roof / rim-clearance / casting-height proportions.
import sys, struct, collections
sys.path.insert(0, 'tools')
from repair_oracles import read_glb, _acc_reader

SPECS = {  # widthM, heightM published
    't80':  (3.52, 2.20),
    't80b': (3.52, 2.20),
    't80bv': (3.52, 2.20),
}

def probe(tid):
    widthM, heightM = SPECS[tid]
    gltf, chunks = read_glb(f'public/models/tanks/community/recovered/{tid}.glb')
    bi = next(i for i, (t, _) in enumerate(chunks) if t == 0x004E4942)
    data = chunks[bi][1]

    reach = []
    def visit(ni, off):
        node = gltf['nodes'][ni]
        t = node.get('translation', [0, 0, 0])
        off = [off[0] + t[0], off[1] + t[1], off[2] + t[2]]
        if 'matrix' in node or 'rotation' in node or 'scale' in node:
            raise SystemExit(f'{tid}: node {node.get("name")} has non-translation TRS')
        if 'mesh' in node:
            reach.append((node.get('name'), node['mesh'], tuple(off)))
        for ci in node.get('children', []):
            visit(ci, off)
    for ri in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        visit(ri, [0.0, 0.0, 0.0])

    def verts(mi, off):
        prim = gltf['meshes'][mi]['primitives'][0]
        acc, n, fmt, o, stride = _acc_reader(gltf, data, prim['attributes']['POSITION'])
        for i in range(acc['count']):
            x, y, z = struct.unpack_from('<fff', data, o + i * stride)
            yield (x + off[0], y + off[1], z + off[2])

    hull = next(r for r in reach if 'Hull' in (r[0] or ''))
    tur = next(r for r in reach if 'Turret' in (r[0] or '') and 'mesh' != r[0])

    gmin = [1e9]*3; gmax = [-1e9]*3
    hullpts = list(verts(hull[1], hull[2]))
    turpts = list(verts(tur[1], tur[2]))
    for pts in (hullpts, turpts):
        for v in pts:
            for k in range(3):
                gmin[k] = min(gmin[k], v[k]); gmax[k] = max(gmax[k], v[k])
    S = widthM / (gmax[0] - gmin[0])
    g = gmin[1]
    m = lambda y: (y - g) * S

    # casting plan extent -> ring zone = central half of the casting z-span
    tz0 = min(p[2] for p in turpts); tz1 = max(p[2] for p in turpts)
    # exclude the fused tube by x-thinness: tube |x| small; casting wide.
    # find casting z-span from wide verts only (|x| > 0.25*halfwidth)
    halfw = (gmax[0] - gmin[0]) / 2
    wide = [p for p in turpts if abs(p[0] - (gmax[0]+gmin[0])/2) > 0.25 * halfw]
    cz0 = min(p[2] for p in wide); cz1 = max(p[2] for p in wide)

    # hull deck at the casting's z-span (ring plateau): max hull y in the
    # central casting zone, excluding sponson-edge spikes: track x band out.
    xc = (gmax[0]+gmin[0])/2
    ring_deck = max((p[1] for p in hullpts
                     if cz0 + 0.2*(cz1-cz0) <= p[2] <= cz1 - 0.2*(cz1-cz0)
                     and abs(p[0]-xc) < 0.45*halfw), default=None)
    hull_top = max(p[1] for p in hullpts)
    # shell rim: min turret y among wide verts ABOVE the interior plug band
    # (plug = anything below hull deck plane); report both
    plug_lo = min(p[1] for p in turpts)
    rim = min((p[1] for p in wide if p[1] > ring_deck - 0.02*(gmax[1]-g)), default=None)
    rim_any = min(p[1] for p in wide)
    top = gmax[1]
    # casting roof: p95 of wide-vert tops is furniture-robust enough here:
    ys = sorted(p[1] for p in wide)
    roof = ys[int(len(ys)*0.999)-1]
    print(f'{tid}: width {gmax[0]-gmin[0]:.3f}u s={S:.5f} ground {g:.3f}')
    print(f'   hull top GLOBAL {m(hull_top):.3f} m | ring-zone deck {m(ring_deck):.3f} m')
    print(f'   casting z {cz0:.1f}..{cz1:.1f}; wide-rim ABOVE deck {m(rim):.3f} m '
          f'(any-wide {m(rim_any):.3f}, plug {m(plug_lo):.3f})')
    print(f'   casting roof(p99.9) {m(roof):.3f} m | whole top {m(top):.3f} m | pub heightM {heightM}')
    print(f'   -> ring deck/top ratio {m(ring_deck)/m(top):.3f}; rim-deck daylight {m(rim)-m(ring_deck):.3f} m; '
          f'casting visible h {m(roof)-m(rim):.3f} m')

for tid in SPECS:
    try:
        probe(tid)
    except SystemExit as e:
        print(e)
    except Exception as e:
        print(f'{tid}: {type(e).__name__} {e}')
