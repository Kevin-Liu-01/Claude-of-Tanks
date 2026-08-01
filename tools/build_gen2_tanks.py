"""build_gen2_tanks.py — scout-gen2 STL candidates -> web-budget articulated GLBs.

Extends the process_stl_tank.py recipe (Root/Turret node tree + RecoveredPaint
material + face-budget conventions) for the gen2 pack's messier sources:
  * per-part axis remaps (this pack mixes Y-up, Z-up, gun-up-print and
    X-length frames — probed 2026-07-31, see MANIFEST notes),
  * turret SEATING for origin-zeroed / scene-offset part pairs (bergman gen2,
    LastTriarius) — ring-plug slab detection + hull roof landing,
  * automatic gun-forward detection for seated turrets (width profile),
  * fused-hull ring-plane turret split (m48 — the t34_85_weihe treatment) and
    component-based split for multi-shell fused prints (vickers_mk1),
  * degenerate-face cleanup (type69 turret ships 0.75% degenerates),
  * flag/banner amputation (vickers_mk1 hoists a fused parade flag).

Usage (one tank per Blender run):
  Blender -b --python tools/build_gen2_tanks.py -- <id> <candidates_dir> <out_glb>
      [--render <dir>]   also render side/front/top PNGs of the assembly
      [--budget N]       override the manifest face budget

ASSEMBLY FRAME (Blender world): X = width, +Z = up, forward = -Y. The glTF
exporter's Y-up conversion (+Z_blender -> +Y_gltf, +Y_blender -> -Z_gltf)
then lands the runtime convention: X = width, Y = up, gun toward +Z. Native
millimetre print scale is kept — modelLoader normalizes against spec.dims
like every recovered GLB.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
p = argparse.ArgumentParser()
p.add_argument("tank")
p.add_argument("src")
p.add_argument("output")
p.add_argument("--render", default=None)
p.add_argument("--budget", type=int, default=0)
opt = p.parse_args(argv)

RX = lambda d: Matrix.Rotation(math.radians(d), 4, "X")
RY = lambda d: Matrix.Rotation(math.radians(d), 4, "Y")
RZ = lambda d: Matrix.Rotation(math.radians(d), 4, "Z")
ID4 = Matrix.Identity(4)

# ---------------------------------------------------------------------------
# MANIFEST — one entry per gen2 candidate (probe notes 2026-07-31).
# rot matrices map each part's authored frame into the ASSEMBLY FRAME above;
# they are baked into the mesh data so the exported node tree is transform-
# free (same as process_stl_tank.py's fixed root rotation, generalized).
# seat: {frontFrac, sink} — ring station measured from the hull FRONT as a
#   fraction of hull length; sink = how deep the turret's bottom lands below
#   the measured hull roof (native mm).
# guessGun: point the seated turret's thin/long overhang toward the front.
# ---------------------------------------------------------------------------
MANIFEST = {
    # bergman T54 refit: hull authored X=width / Y=up / Z=length with the
    # sprocket (rear) at +Z; turret authored upright gun +Z, ring plug -Y.
    "t54": {
        "hull": [("t54/t54_refit_hull.stl", RZ(180) @ RX(90))],
        "turret": [("t54/t54_refit_turret.stl", RX(90))],
        "seat": {"frontFrac": 0.40, "sink": 8.5},
        "guessGun": True, "budget": 120000,
    },
    # bergman T-62 (batch-9 oracle-candidate eval for t62mv1; same zip as the
    # t54 refit -> same authoring frames: hull X=width/Y=up/Z=length with the
    # sprocket at +Z, turret upright gun +Z ring plug -Y). QUARANTINE BAKE:
    # evaluation output only, not registered anywhere (candidates-gen2/t62).
    "t62": {
        "hull": [("t62/t62_hull.stl", RZ(180) @ RX(90))],
        "turret": [("t62/t62_turret.stl", RX(90))],
        # frontFrac 0.35 = the published seat (turret centre +1.07 m ahead of
        # hull centre on the 6.63 m hull -> +10.9 mm at 1:100 from the bow of
        # the 72.8 mm print hull).
        "seat": {"frontFrac": 0.35, "sink": 8.5},
        "guessGun": True, "budget": 120000,
    },
    # bergman T80 family: turrets share the T54 conventions but the HULLS are
    # authored with the front at +Z (the t54's is at -Z — first-bake render
    # showed rear drums + exhaust louvres on the nose): plain RX(90).
    "t80": {
        "hull": [("t80/t80_early_hull.stl", RX(90))],
        "turret": [("t80/t80_early_turret.stl", RX(90))],
        "seat": {"frontFrac": 0.46, "sink": 8.0},
        "guessGun": True, "budget": 130000,
    },
    "t80b": {
        "hull": [("t80b/t80b_applique_hull.stl", RX(90))],
        "turret": [("t80b/t80b_turret.stl", RX(90))],
        "seat": {"frontFrac": 0.46, "sink": 8.0},
        "guessGun": True, "budget": 130000,
    },
    "t80bv": {
        "hull": [("t80bv/t80bv_fullera_hull.stl", RX(90))],
        "turret": [("t80bv/t80bv_turret.stl", RX(90))],
        "seat": {"frontFrac": 0.46, "sink": 8.0},
        "guessGun": True, "budget": 130000,
    },
    # Foxygamer T-44: authored already in the assembly frame (front -Y,
    # Z up), hull+turret PRE-ALIGNED in one scene -> no seating.
    "t44": {
        "hull": [("t44/t44_hull.stl", ID4)],
        "turret": [("t44/t44_turret.stl", ID4)],
        "budget": 60000,
    },
    # ATModeler M48A5: single FUSED solid in the assembly frame. Ring-plane
    # turret split at the normalized cut height (t34_85_weihe treatment).
    "m48": {
        "hull": [("m48/m48a5_atmodeler.stl", ID4)],
        "fusedCut": 0.615, "budget": 60000,
    },
    # Captain_Ahab_62 M60A2: three PRE-ALIGNED parts in the assembly frame;
    # the separate cupola rides with the turret group.
    "m60a2": {
        "hull": [("m60a2/m60a2_hull.stl", ID4)],
        "turret": [("m60a2/m60a2_turret.stl", ID4),
                   ("m60a2/m60a2_cupola.stl", ID4)],
        "budget": 40000,
    },
    # Captain_Ahab_62 AMX-30B: hull authored X=length (front +X) / Z=up;
    # turret authored gun -X with the ring plug -Z. Parts not co-located.
    "amx30": {
        "hull": [("amx30/amx30_hull_noskirt.stl", RZ(-90))],
        "turret": [("amx30/amx30_turret_ir.stl", RZ(90))],
        "seat": {"frontFrac": 0.44, "sink": 7.5},
        "guessGun": True, "budget": 30000,
    },
    # AMX-30B2 spec variant: same turret on the side-skirt hull bake.
    "amx30b2": {
        "hull": [("amx30/amx30_hull_skirt.stl", RZ(-90))],
        "turret": [("amx30/amx30_turret_ir.stl", RZ(90))],
        "seat": {"frontFrac": 0.44, "sink": 7.5},
        "guessGun": True, "budget": 30000,
    },
    # LastTriarius Type 69 (Type 59 visual base): assembly-frame axes but the
    # parts live at unrelated scene offsets -> seat. The turret ships 0.75%
    # degenerate faces -> cleanup, and 455k tris -> decimate.
    "type59": {
        "hull": [("type59/type69_hull.stl", ID4)],
        "turret": [("type59/type69_turret.stl", ID4)],
        "seat": {"frontFrac": 0.40, "sink": 8.5},
        "guessGun": True, "cleanup": True, "budget": 130000,
    },
    # LastTriarius T-84 Oplot remix: same conventions; 770k-tri hull ->
    # hard decimate to the recovered-fleet budget.
    "t84": {
        "hull": [("t84/t84_hull.stl", ID4)],
        "turret": [("t84/t84_turret.stl", ID4)],
        "seat": {"frontFrac": 0.44, "sink": 4.0},
        "guessGun": True, "cleanup": True, "budget": 260000,
    },
    # JackTheTinkerer Vickers MBT Mk.1: ONE assembled multi-shell print
    # (assembly-frame axes, ~1:40) hoisting a fused flag over the turret;
    # amputate everything above z=70 native (flag + mast top), then the
    # turret separates as the non-hull shells straddling the ring plane.
    "vickers_mk1": {
        "hull": [("vickers_mk1/vickers_mk1.stl", ID4)],
        "deleteAboveZ": 70.0,
        "componentCut": 0.60, "cleanup": True, "budget": 55000,
    },
}


def die(msg):
    print("GEN2_FATAL", msg)
    sys.exit(1)


if opt.tank not in MANIFEST:
    die(f"unknown tank id {opt.tank}")
cfg = MANIFEST[opt.tank]

bpy.ops.wm.read_factory_settings(use_empty=True)


def load_parts(entries, label):
    objs = []
    for i, (rel, mtx) in enumerate(entries):
        path = os.path.join(opt.src, rel)
        before = set(bpy.context.scene.objects)
        bpy.ops.wm.stl_import(filepath=os.path.abspath(path))
        added = [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]
        if not added:
            die("no mesh imported from " + path)
        for j, obj in enumerate(added):
            obj.name = f"{label}{i}_{j}"
            obj.data.transform(mtx)
            obj.data.update()
            objs.append(obj)
    return objs


def join(objs, name):
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    bpy.ops.object.select_all(action="DESELECT")
    return obj


def bounds(obj):
    vs = obj.data.vertices
    lo = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs)))
    hi = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
    return lo, hi


def cleanup_degenerates(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.dissolve_degenerate(threshold=0.001)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def decimate(objs, budget):
    """Planar dissolve first, collapse second.

    These sources are CAD/print tessellations — most triangles lie on flat
    faces. A pure collapse at ratio ~0.15 shredded the t84 (thin ERA plates
    and skirt shells melt into spikes); the planar pass removes coplanar
    fill at zero visual cost so the collapse stage stays gentle.
    """
    total = sum(len(o.data.polygons) for o in objs)
    if not budget or total <= budget:
        return total, total
    for obj in objs:
        if len(obj.data.polygons) < 500:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new("COT_Planar", "DECIMATE")
        mod.decimate_type = "DISSOLVE"
        mod.angle_limit = math.radians(3.0)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        # dissolve leaves ngons; triangulate for stable counts + export
        mod = obj.modifiers.new("COT_Tri", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    mid = sum(len(o.data.polygons) for o in objs)
    if mid > budget:
        ratio = max(0.04, budget / mid)
        for obj in objs:
            if len(obj.data.polygons) < 500:
                continue
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            mod = obj.modifiers.new("COT_PerfBudget", "DECIMATE")
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(False)
    print("GEN2_DECIMATE", total, "->", mid, "->",
          sum(len(o.data.polygons) for o in objs))
    return total, sum(len(o.data.polygons) for o in objs)


def delete_faces_above_z(obj, level):
    """Remove faces whose center sits above `level` (flag masts/banners)."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    n = 0
    for poly in obj.data.polygons:
        poly.select = poly.center.z > level
        n += poly.select
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return n


def connected_face_groups(obj):
    """Vertex-shared face islands (same approach as process_tank_asset.py)."""
    vertex_faces = {}
    for poly in obj.data.polygons:
        for vi in poly.vertices:
            vertex_faces.setdefault(vi, []).append(poly.index)
    visited = bytearray(len(obj.data.polygons))
    groups = []
    for start in range(len(obj.data.polygons)):
        if visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        group = []
        while stack:
            fi = stack.pop()
            group.append(fi)
            for vi in obj.data.polygons[fi].vertices:
                for nb in vertex_faces[vi]:
                    if not visited[nb]:
                        visited[nb] = 1
                        stack.append(nb)
        groups.append(group)
    return groups


def separate_faces(obj, face_indices, name):
    wanted = set(face_indices)
    if not wanted:
        die(f"{name}: empty selection")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for poly in obj.data.polygons:
        poly.select = poly.index in wanted
    before = set(bpy.context.scene.objects)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    made = [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]
    if len(made) != 1:
        die(f"{name}: split produced {len(made)} objects")
    made[0].name = name
    bpy.ops.object.select_all(action="DESELECT")
    return made[0]


def slab_centroid(obj, z0, z1):
    """Plan centroid of the verts inside a horizontal slab (ring plug/race)."""
    acc = Vector((0, 0, 0))
    n = 0
    for v in obj.data.vertices:
        if z0 <= v.co.z <= z1:
            acc += v.co
            n += 1
    return acc / n if n else None


def gun_forward_fix(obj):
    """Point the fused gun toward -Y (assembly front).

    Splits the turret's length (Y) range into 24 bins, measures each bin's
    X width; bins under 35% of the max width are 'tube'. Whichever end owns
    the longer thin run is the muzzle; yaw 180 deg when it faces +Y.
    """
    lo, hi = bounds(obj)
    span = hi.y - lo.y
    if span < 1e-6:
        return False
    bins = 24
    wmin = [None] * bins
    wmax = [None] * bins
    for v in obj.data.vertices:
        b = min(bins - 1, int((v.co.y - lo.y) / span * bins))
        wmin[b] = v.co.x if wmin[b] is None else min(wmin[b], v.co.x)
        wmax[b] = v.co.x if wmax[b] is None else max(wmax[b], v.co.x)
    widths = [(wmax[i] - wmin[i]) if wmin[i] is not None else 0.0 for i in range(bins)]
    peak = max(widths)
    thin = [w < peak * 0.35 for w in widths]
    low_run = 0
    for i in range(bins):
        if thin[i]:
            low_run += 1
        else:
            break
    high_run = 0
    for i in range(bins - 1, -1, -1):
        if thin[i]:
            high_run += 1
        else:
            break
    if high_run > low_run:  # muzzle at +Y -> yaw the part around its center
        ctr = (lo + hi) / 2
        obj.data.transform(Matrix.Translation(ctr) @ RZ(180) @ Matrix.Translation(-ctr))
        obj.data.update()
        return True
    return False


def hull_roof_z(hull, station_y, half_probe, half_width, ring_r):
    """Roof height near the ring station.

    Hulls with an OPEN turret-ring aperture (t80b applique) have no roof
    verts at the station itself — a centered probe sampled the interior
    floor and buried the turret. Probe three bands (ring center + just
    ahead/behind the ring) and take max(center, min(front, rear)): the
    center band wins on solid roofs, the ring-adjacent plate wins on open
    rings, and the min() keeps one-sided stowage stacks from inflating it.
    """
    def band(y_ctr, half):
        zs = [v.co.z for v in hull.data.vertices
              if abs(v.co.y - y_ctr) <= half and abs(v.co.x) <= half_width]
        if not zs:
            return None
        zs.sort()
        return zs[int(len(zs) * 0.95) - 1 if len(zs) > 20 else -1]

    center = band(station_y, half_probe)
    front = band(station_y - ring_r * 1.15, ring_r * 0.25)
    rear = band(station_y + ring_r * 1.15, ring_r * 0.25)
    cands = [v for v in [center] if v is not None]
    flanks = [v for v in [front, rear] if v is not None]
    if flanks:
        cands.append(min(flanks))
    return max(cands) if cands else None


# ---------------------------------------------------------------------------
# pipeline
# ---------------------------------------------------------------------------
hull_objs = load_parts(cfg["hull"], "HullPart")
turret_objs = load_parts(cfg.get("turret", []), "TurretPart")

hull = join(hull_objs, "HullMesh")
turret = join(turret_objs, "TurretMesh") if turret_objs else None

if cfg.get("cleanup"):
    for obj in [hull] + ([turret] if turret else []):
        cleanup_degenerates(obj)

# center the hull in plan and drop it onto z=0 BEFORE seating/splitting so
# stations, pivots and check renders live in one predictable frame
hlo, hhi = bounds(hull)
shift = Matrix.Translation(Vector((-(hlo.x + hhi.x) / 2, -(hlo.y + hhi.y) / 2, -hlo.z)))
hull.data.transform(shift)
hull.data.update()
if turret is not None and "seat" not in cfg:
    turret.data.transform(shift)  # pre-aligned pair rides the exact shift
    turret.data.update()
hlo, hhi = bounds(hull)

# flag amputation (vickers): the native level moves with the hull shift
if cfg.get("deleteAboveZ") is not None:
    cut = cfg["deleteAboveZ"] + shift.translation.z
    n = delete_faces_above_z(hull, cut)
    print("GEN2_FLAGCUT", opt.tank, "z", round(cut, 2), "faces", n)
    hlo, hhi = bounds(hull)

# fused single-solid split (m48): ring-plane face cut, t34_85_weihe treatment.
# Only the LARGEST connected island above the plane is the turret — raised
# engine-deck castings and fender stowage also poke above the ring level on
# a fused print and must stay with the hull (first-cut lesson: the M48's
# rear deck bump yawed with the turret and left a hole in the hull roof).
if cfg.get("fusedCut"):
    cut_z = hlo.z + (hhi.z - hlo.z) * cfg["fusedCut"]
    picked = {p.index for p in hull.data.polygons if p.center.z >= cut_z}
    vertex_faces = {}
    for fi in picked:
        for vi in hull.data.polygons[fi].vertices:
            vertex_faces.setdefault(vi, []).append(fi)
    remaining = set(picked)
    islands = []
    while remaining:
        seed = next(iter(remaining))
        remaining.discard(seed)
        stack = [seed]
        island = [seed]
        while stack:
            fi = stack.pop()
            for vi in hull.data.polygons[fi].vertices:
                for nb in vertex_faces[vi]:
                    if nb in remaining:
                        remaining.discard(nb)
                        stack.append(nb)
                        island.append(nb)
        islands.append(island)
    islands.sort(key=len, reverse=True)
    turret = separate_faces(hull, islands[0], "TurretMesh")
    print("GEN2_SPLIT", opt.tank, "cut_z", round(cut_z, 3), "islands",
          [len(i) for i in islands[:6]], "turret_faces", len(islands[0]))

# fused multi-shell split (vickers): whole components above the ring plane
if cfg.get("componentCut"):
    ring_z = hlo.z + (hhi.z - hlo.z) * cfg["componentCut"]
    span = hhi.z - hlo.z
    groups = connected_face_groups(hull)
    groups.sort(key=len, reverse=True)
    picked = []
    for gi, group in enumerate(groups):
        if gi == 0:
            continue  # the largest island is the hull shell
        zs = [hull.data.polygons[fi].center.z for fi in group]
        if sum(zs) / len(zs) >= ring_z - span * 0.04 and max(zs) > ring_z:
            picked.extend(group)
    turret = separate_faces(hull, picked, "TurretMesh")
    print("GEN2_SPLIT", opt.tank, "components", len(groups), "ring_z",
          round(ring_z, 3), "faces", len(picked))

# gun-forward detection BEFORE seating (yaw happens about the part's own
# center; seating then places the ring axis)
if turret is not None and cfg.get("guessGun"):
    flipped = gun_forward_fix(turret)
    print("GEN2_GUNDIR", opt.tank, "flipped" if flipped else "kept")

# seat an origin-zeroed / scene-offset turret onto the hull ring
seat_report = None
if turret is not None and "seat" in cfg:
    tlo, thi = bounds(turret)
    slab = slab_centroid(turret, tlo.z, tlo.z + (thi.z - tlo.z) * 0.12)
    if slab is None:
        die("turret bottom slab empty")
    hull_len = hhi.y - hlo.y
    station_y = hlo.y + cfg["seat"]["frontFrac"] * hull_len  # front = -Y
    roof_z = hull_roof_z(hull, station_y, hull_len * 0.06, (hhi.x - hlo.x) * 0.18,
                         (hhi.x - hlo.x) * 0.34)
    if roof_z is None:
        die("no hull roof verts at ring station")
    target_z = roof_z - cfg["seat"]["sink"]
    turret.data.transform(Matrix.Translation(
        Vector((-slab.x, station_y - slab.y, target_z - tlo.z))))
    turret.data.update()
    seat_report = (round(station_y, 2), round(roof_z, 2))

faces_before, faces_after = decimate([hull] + ([turret] if turret else []),
                                     opt.budget or cfg.get("budget", 120000))

# node tree: Root > HullMesh + Turret(empty at ring pivot) > TurretMesh
root = bpy.data.objects.new("Root", None)
bpy.context.scene.collection.objects.link(root)
hull.parent = root
pivot_txt = "fixed"
if turret is not None:
    tlo, thi = bounds(turret)
    slab = slab_centroid(turret, tlo.z, tlo.z + (thi.z - tlo.z) * 0.10) or (tlo + thi) / 2
    pivot = Vector((slab.x, slab.y, tlo.z))
    tnode = bpy.data.objects.new("Turret", None)
    bpy.context.scene.collection.objects.link(tnode)
    tnode.parent = root
    tnode.location = pivot
    turret.parent = tnode
    turret.location = -pivot
    pivot_txt = tuple(round(v, 2) for v in pivot)

mat = bpy.data.materials.new("RecoveredPaint")
mat.diffuse_color = (0.28, 0.32, 0.22, 1)
mat.roughness = 0.78
for obj in [hull] + ([turret] if turret else []):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True

dst = os.path.abspath(opt.output)
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True,
                          export_materials="EXPORT", export_animations=False)
print("COT_GEN2", opt.tank, "faces", faces_before, "->", faces_after,
      "seat", seat_report, "pivot", pivot_txt,
      "bytes", os.path.getsize(dst))

# ---------------------------------------------------------------------------
# optional check renders of the assembled model (side / front / top)
# ---------------------------------------------------------------------------
if opt.render:
    os.makedirs(opt.render, exist_ok=True)

    def world_bounds(objs):
        los, his = [], []
        bpy.context.view_layer.update()
        for o in objs:
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                los.append(w.copy())
                his.append(w.copy())
        lo = Vector((min(v.x for v in los), min(v.y for v in los), min(v.z for v in los)))
        hi = Vector((max(v.x for v in his), max(v.y for v in his), max(v.z for v in his)))
        return lo, hi

    lo, hi = world_bounds([hull] + ([turret] if turret else []))
    ctr = (lo + hi) / 2
    span = hi - lo
    diag = max(span) * 1.3
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 560
    scene.render.resolution_y = 380
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.color = (0.08, 0.09, 0.11)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    aspect = scene.render.resolution_y / scene.render.resolution_x
    fit = lambda w, h: max(w, h / aspect)
    views = {
        "side": ((ctr.x + diag * 2, ctr.y, ctr.z), (math.pi / 2, 0, math.pi / 2),
                 fit(span.y, span.z)),
        "front": ((ctr.x, ctr.y - diag * 2, ctr.z), (math.pi / 2, 0, 0),
                  fit(span.x, span.z)),
        "top": ((ctr.x, ctr.y, ctr.z + diag * 2), (0, 0, 0),
                fit(span.x, span.y)),
    }
    for name, (loc, rot, extent) in views.items():
        cam.location = loc
        cam.rotation_euler = rot
        cam_data.ortho_scale = extent * 1.12 + 1e-3
        scene.render.filepath = os.path.join(opt.render, f"{opt.tank}_{name}.png")
        bpy.ops.render.render(write_still=True)
    print("GEN2_RENDERED", opt.tank)
