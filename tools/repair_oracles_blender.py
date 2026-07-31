# Blender-headless companion to tools/repair_oracles.py for the recovered
# oracles whose turret kits cannot be assembled by a single node transform.
# The m_bergman print GLBs ship one fused "Turret" skin that actually contains
# several authored print parts (sunken casting, flat-pack spare plates, raft
# discs, rod-barrel stubs); fv510's Turret skin fuses the bow plating.
#
# The repair re-assembles the SAME artist's parts with rigid moves only:
#   * carve each authored part out of the fused skin by selecting its vertex
#     region and using mesh.separate(SELECTED) — a topological re-grouping
#     that duplicates boundary vertices and changes no triangle shape;
#     stitch faces that span two parts stay behind in the residual object,
#   * rigidly translate the carved parts (turret onto the ring, gun stubs
#     onto the mantlet face); print rafts/spares/residual are parked inside
#     the hull shell so they stop polluting silhouettes without deleting
#     any of the artist's data,
#   * rebuild the node tree the game loader expects: HullMesh (untouched),
#     `Turret` empty on the ring axis (autoPivot origin branch) holding the
#     joined TurretMesh, plus optional kept children (fv510's Gun).
# No vertices are sculpted, nothing is deleted, no foreign geometry enters.
#
# Usage:
#   blender -b --python tools/repair_oracles_blender.py -- dump <glb> <Mesh...>
#   blender -b --python tools/repair_oracles_blender.py -- repair <id>
#
# `repair` reads public/models/tanks/community/recovered/<id>.glb.bak (created
# from the shipping file on first run) and rewrites <id>.glb.
import bpy
import bmesh
import shutil
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
RECOVERED = ROOT / 'public' / 'models' / 'tanks' / 'community' / 'recovered'

# ---------------------------------------------------------------- recipes --
# All coordinates are glb-world (the frame docs/references packets measure):
# +y up, +z the file's authored long axis. A region rule is
#   (box[x0,x1,y0,y1,z0,z1], target, move[dx,dy,dz])
# applied in order to still-unassigned vertices; targets: 'turret' (joined
# under the Turret empty), 'park' (translated so the region centre lands on
# the park point, joined into a root-level PrintSpares object), 'root:<Name>'
# (joined as a standalone root object, e.g. fv510 bow back to the hull side).
# The unmatched residual of every carved source mesh is parked too unless
# 'residual' says 'keep'.
RECIPES = {
    # ------------------------------------------------------------------ UK --
    # Round-3 correction (r2 critique: "turret aft of an open ring pit",
    # "detached barrel", "exploded splat"). Solo-mesh renders of the .baks
    # prove every UK print's TurretMesh is ONE fully-assembled turret —
    # casting + complete gun (extractor/brake and all) + basket cylinder —
    # authored sunk into the rear hull with the barrel resting past the nose.
    # There are NO print-bed spares: the r1 "spares"/"flat-pack plates" boxes
    # were carving real turret furniture off (centurion castings, comet bin
    # walls, charioteer rear stowage), and the "gun stub" regions were slicing
    # the attached barrel. The correct repair is a single rigid move of the
    # whole mesh: basket ring (36-vert circle at y0, Kasa fit) onto the hull
    # deck's authored ring-pit race (Kasa fit at deck band), casting base on
    # the deck plate, pivot at the pit centre.
    'charioteer': {
        'sources': ['TurretMesh'],
        'pivot': [15.30, 15.2, 37.40],   # hull pit race c=(15.300,37.400) r6.2
        'park': None,
        'lift': 7.0,   # casting base y7.0 -> deck plate y14.0
        'regions': [
            # whole assembled turret: basket c=(11.795,18.033) -> pit
            ((-0.5, 24.1, -0.5, 18.6, -0.5, 67.9), 'turret',
             (3.505, 'lift', 19.367)),
        ],
    },
    'comet': {
        'sources': ['TurretMesh'],
        'pivot': [14.60, 15.5, 39.00],   # hull pit race c=(14.600,39.000) r6.2
        'park': None,
        'lift': 7.5,   # casting base y7.5 -> deck plate y15.0
        'regions': [
            # whole assembled turret: basket c=(11.573,18.100) -> pit
            ((-0.5, 27.2, -0.5, 18.4, -0.5, 57.2), 'turret',
             (3.027, 'lift', 20.900)),
        ],
    },
    'challenger_cruiser': {
        'sources': ['TurretMesh'],
        'pivot': [15.20, 15.5, 37.03],   # hull pit race c=(15.200,37.031)
        'park': None,
        'lift': 7.2,   # wall base y7.5 -> deck plate y14.7
        'regions': [
            # whole assembled A30 turret: basket c=(13.208,15.010) -> pit
            ((-0.5, 24.0, -0.5, 19.7, -0.5, 60.1), 'turret',
             (1.992, 'lift', 22.021)),
        ],
    },
    'centurion3': {
        'sources': ['TurretMesh'],
        'pivot': [16.90, 15.8, 41.87],   # hull pit race c=(16.900,41.870) r7.2
        'park': None,
        'lift': 6.5,   # skirt tips y8.5 -> deck plate y15.0 (roof lands 2.9 m)
        'regions': [
            # whole assembled turret: basket c=(15.374,19.430) -> pit
            ((-0.5, 31.3, -0.5, 22.5, -0.5, 75.3), 'turret',
             (1.526, 'lift', 22.440)),
        ],
    },
    'centurion5': {
        'sources': ['TurretMesh'],
        'pivot': [16.90, 15.8, 41.87],   # same hull print as centurion3
        'park': None,
        'lift': 6.5,   # bore lands y19.1 (~2.0 m), roof 28.5 (~2.97 m)
        'regions': [
            # whole assembled turret incl. co-axial L7 (bore x15.37 y12.60,
            # authored muzzle at bow+3.9): basket c=(15.374,23.400) -> pit
            ((-0.5, 31.3, -0.5, 22.5, -0.5, 79.3), 'turret',
             (1.526, 'lift', 18.470)),
        ],
    },
    'fv510': {
        # fv510 needs re-grouping only: the authored TurretMesh fuses the
        # entire upper bow/glacis plating (and the wing mirrors) with the
        # turret. Carve everything forward of the turret box back to the
        # hull side, in place — the mirrors keep defining the width bound,
        # they just stop yawing with the turret. The 25-vert Gun sliver is
        # kept as-is (the RARDEN never clears the nose, so the gun-overhang
        # masks stay legitimately empty on both sides).
        'sources': ['TurretMesh'],
        'pivot': None,          # keep the authored origin; autoPivot's
                                # footprint fallback now sees only the turret
        'park': None,           # nothing is junk; residual stays the turret
        'keep_children': ['Gun'],
        'regions': [
            ((-0.02, 0.02, -0.02, 0.02, 0.0062, 0.02), 'root:BowPlating', None),
        ],
    },
    'm1a1_aim': {
        # The print's "turret" skin is the ENTIRE upper-body shell: sponson
        # side walls (the packet's four full-height upper-mask strips), rear
        # engine deck + exhaust stack, glacis-top plates — plus the actual
        # casting, which is sunk with its basket disc (r8, centred x17.79
        # z36.45) on the ground plane and the M256 at axis y12.65 (1.27 m).
        # Re-tag the hull shell pieces to the hull IN PLACE and lift only the
        # casting + basket + gun onto the deck (deck y~16 at the ring).
        # lift swept 5.8..8.4 (73.7..74.5, near-flat); 7.6 is the exact
        # rim-on-deck seat — rim 16.0, bore axis 2.04 m, roof 2.62 m (proc
        # targets 1.96/2.52).
        'sources': ['TurretMesh'],
        'pivot': [17.79, 16.0, 36.45],   # authored basket axis, ring plane
        'park': [17.3, 9.0, 30.0],       # unused (no park regions); keeps the
                                         # stitch residual hull-side in place
        'lift': 7.6,
        'regions': [
            # sponson side walls, both sides, full height/length — hull, in place
            ((-0.5, 4.2, -0.5, 25.0, -0.5, 53.0), 'root:HullPlating', None),
            ((30.6, 35.3, -0.5, 25.0, -0.5, 53.0), 'root:HullPlating', None),
            # rear engine deck + exhaust stack (proc builds the stack on the
            # hull; a chimney orbiting the hump at yaw is the r1 bug class)
            ((4.2, 30.6, -0.5, 25.0, -0.5, 20.8), 'root:HullPlating', None),
            # glacis-top deck skin ahead of the casting, above the tube line
            ((4.2, 30.6, 15.35, 25.0, 44.47, 60.0), 'root:HullPlating', None),
            # M256 + mantlet collar (evacuator top y14.6, glacis line >=15.5)
            ((11.8, 23.2, 9.3, 15.3, 44.47, 91.5), 'turret', (0.0, 'lift', 0.0)),
            # turret casting + basket cylinder + ground-plane basket disc
            ((4.2, 30.6, -0.5, 25.0, 20.8, 44.47), 'turret', (0.0, 'lift', 0.0)),
            # casting front lower shell / rim arc under the glacis-line band
            ((4.2, 30.6, -0.5, 15.35, 44.47, 55.4), 'turret', (0.0, 'lift', 0.0)),
        ],
    },
    'is3_bergman': {
        # Print-bed layout, not an assembly: the dome is parked over the rear
        # deck (ring-disc centre x15.22 z15.22, ground plane) with the D-25T
        # + mantlet floating mid-hull (z26..74, axis y12.2), while the hull
        # deck carries an authored ring RACE (r6.2 vert circle, y16.0, centre
        # x16.67 z42.71) that exactly matches the basket disc (r6.0). Rear
        # fenders/drums are authored in correct hull positions but tagged
        # into the Turret node. Move the dome+basket rigidly onto the race
        # (dx +1.45, dz +27.49), butt the mantlet to the dome front face
        # (dz +24.29 closes the 3.2-unit print gap; muzzle lands 2.44 m past
        # the bow vs the proc's 2.25), re-tag fenders/drums to the hull in
        # place. The print's bore is authored 1.06 m under its crown (real
        # D-25T sits ~0.6 under): lift swept 4..8 (75.4..81.6, monotone) —
        # honesty brackets it to [5.8 = barrel clears the glacis, ~8 = skirt
        # rim still on the deck]. 8.0: rim deck+0.06 m, axis 1.91 m,
        # crown 2.97 m.
        'file': 'bergman_is3',
        'sources': ['TurretMesh'],
        'pivot': [16.67, 16.0, 42.71],   # hull ring race centre
        'park': [16.7, 8.0, 36.0],       # unused (no park regions)
        'lift': 8.0,
        'regions': [
            # rear fenders + fuel drums, both sides — hull, in place
            ((-0.5, 2.6, -0.5, 24.0, -0.5, 23.5), 'root:FenderKit', None),
            ((27.9, 31.0, -0.5, 24.0, -0.5, 23.5), 'root:FenderKit', None),
            # D-25T + mantlet, butted onto the relocated dome front face
            ((10.0, 21.0, 8.0, 17.5, 25.5, 74.5), 'turret', (1.45, 'lift', 24.29)),
            # dome + basket wall + ground-plane basket disc, onto the race
            ((2.0, 28.5, -0.5, 23.9, -0.5, 24.5), 'turret', (1.45, 'lift', 27.49)),
        ],
    },
}


# Blender's glTF importer converts the file's +Y-up world to Blender Z-up:
# blender (x, y, z) = glb (x, -z, y).
def to_glb(v):
    return (v.x, v.z, -v.y)


def delta_to_blender(d):
    return Vector((d[0], -d[2], d[1]))


def point_to_blender(p):
    return Vector((p[0], -p[2], p[1]))


def world_box(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    g = [to_glb(p) for p in pts]
    lo = [min(p[i] for p in g) for i in range(3)]
    hi = [max(p[i] for p in g) for i in range(3)]
    return lo, hi


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def carve(obj, box):
    """Separate the vertices of obj inside glb-world box into a new object."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    # Clear every stale selection flag (import leaves faces selected, which
    # would make separate(SELECTED) grab the whole mesh).
    bpy.ops.mesh.select_mode(type='VERT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    mw = obj.matrix_world
    hit = 0
    for v in bm.verts:
        g = to_glb(mw @ v.co)
        inside = (box[0] <= g[0] <= box[1] and box[2] <= g[1] <= box[3]
                  and box[4] <= g[2] <= box[5])
        v.select = inside
        hit += inside
    bm.select_flush(True)
    bmesh.update_edit_mesh(obj.data)
    if not hit:
        bpy.ops.object.mode_set(mode='OBJECT')
        return None
    before = set(bpy.data.objects)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.data.objects if o not in before]
    return new[0] if new else None


def join(parts, name):
    parts = [p for p in parts if p is not None]
    if not parts:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    mode = argv[0]

    if mode == 'dump':
        load(argv[1])
        for name in argv[2:]:
            obj = bpy.data.objects[name]
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.mesh.separate(type='LOOSE')
            parts = sorted(bpy.context.selected_objects,
                           key=lambda o: -len(o.data.vertices))
            print(f'== {name}: {len(parts)} loose parts (glb-world)')
            for p in parts:
                lo, hi = world_box(p)
                c = [(lo[i] + hi[i]) / 2 for i in range(3)]
                print(f'  v={len(p.data.vertices):6d} c=({c[0]:8.4f},{c[1]:8.4f},{c[2]:8.4f}) '
                      f'x {lo[0]:8.4f}..{hi[0]:8.4f} y {lo[1]:8.4f}..{hi[1]:8.4f} '
                      f'z {lo[2]:8.4f}..{hi[2]:8.4f}')
        return

    tank_id = argv[1]
    recipe = RECIPES[tank_id]
    lift = float(argv[argv.index('--lift') + 1]) if '--lift' in argv else recipe.get('lift', 0.0)
    dz = float(argv[argv.index('--dz') + 1]) if '--dz' in argv else recipe.get('dz', 0.0)
    stem = recipe.get('file', tank_id)   # is3_bergman ships as bergman_is3.glb
    src = RECOVERED / f'{stem}.glb'
    bak = RECOVERED / f'{stem}.glb.bak'
    if not bak.exists():
        shutil.copy2(src, bak)
    load(bak)

    resolve = lambda d: [lift if x == 'lift' else x for x in d[:2]] + [d[2] + dz]
    groups = {'turret': [], 'park': [], 'spares_inplace': []}
    roots = {}
    for name in recipe['sources']:
        source_obj = bpy.data.objects[name]
        for box, target, move in recipe['regions']:
            part = carve(source_obj, box)
            if part is None:
                print(f'[bl_repair] {tank_id}: region {box} matched nothing')
                continue
            if target == 'park':
                lo, hi = world_box(part)
                c = [(lo[i] + hi[i]) / 2 for i in range(3)]
                part.location += point_to_blender(recipe['park']) - point_to_blender(c)
                groups['park'].append(part)
            elif target.startswith('root:'):
                roots.setdefault(target[5:], []).append(part)
            else:
                if move:
                    part.location += delta_to_blender(resolve(move))
                groups['turret'].append(part)
        # Residual = stitch faces the carves left behind plus unmatched print
        # junk. Its pieces were authored inside the hull envelope (sunken or
        # raft-level), so it must stay exactly where it is — centring it on
        # the park point would drag the long stitch web outside the hull.
        if recipe.get('park') is not None:
            groups['spares_inplace'].append(source_obj)
        else:
            groups['turret'].append(source_obj)

    # keep listed children (fv510 Gun) with their subtrees for re-parenting
    kept = []
    for kname in recipe.get('keep_children', []):
        k = bpy.data.objects.get(kname)
        if k:
            mw = k.matrix_world.copy()
            k.parent = None
            k.matrix_world = mw   # unparent without moving
            kept.append(k)

    spares = join(groups['park'] + groups['spares_inplace'], 'PrintSpares')
    for rname, parts in roots.items():
        join(parts, rname)
    turret_mesh = join(groups['turret'], 'TurretMesh')

    if recipe['pivot'] is not None:
        pivot = point_to_blender(recipe['pivot'])
    else:
        old = bpy.data.objects.get('Turret')
        pivot = old.matrix_world.translation.copy() if old else Vector((0, 0, 0))

    for obj in list(bpy.data.objects):
        if obj.type == 'EMPTY' and obj not in kept:
            bpy.data.objects.remove(obj, do_unlink=True)

    turret_empty = bpy.data.objects.new('Turret', None)
    bpy.context.scene.collection.objects.link(turret_empty)
    turret_empty.location = pivot
    bpy.context.view_layer.update()  # empty's matrix_world must be current
    for child in [turret_mesh] + kept:
        if child is None:
            continue
        child.parent = turret_empty
        child.matrix_parent_inverse = turret_empty.matrix_world.inverted()
    bpy.context.view_layer.update()

    bpy.ops.export_scene.gltf(filepath=str(src), export_format='GLB',
                              export_yup=True, export_apply=False)
    print(f'[bl_repair] {tank_id}: lift={lift} dz={dz} -> {src} (original at {bak.name})')


main()
