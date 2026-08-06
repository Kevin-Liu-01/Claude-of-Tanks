#!/usr/bin/env python3
"""TEMP (leo2_revolution batch-43 WING-BAND EXCISION, §E sim lane).

Builds a CANDIDATE repaired GLB in scratch (shots/leo-wingex/) by applying
the proposed batch-43 ops to the COMMITTED bytes via repair_oracles' own op
builders — the committed GLB is never written. The op literals here are the
exact literals reported for the orchestrator's batch-43.

Usage:
  python3 tools/tmp-leo-wingex-mkglb.py --rules=a [--out=shots/leo-wingex/candidate.glb]
  python3 tools/tmp-leo-wingex-mkglb.py --rules=a --dry   # census only, no write
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_oracles as RO

SRC = RO.RECOVERED / 'leo2_revolution.glb'


# ---------------------------------------------------------------- ops -------
def drop_gunmesh_prim0(gltf):
    """batch-43 op 2: GunMesh ('chassis_vlo.001') primitive 0 is ONE degenerate
    triangle (3v/1t, glb world x -1.843..-0.028, y 0.292 const, z -3.419..
    -3.382) — the plan_turret 'wing fronts w 3.54-3.57' carrier. Keep prim 1
    (the real 356v/286t gun tube). Guard: exact prim census before dropping."""
    ni = RO.find_node(gltf, 'GunMesh')
    mesh = gltf['meshes'][gltf['nodes'][ni]['mesh']]
    prims = mesh['primitives']
    assert len(prims) == 2, f'GunMesh: expected 2 prims, got {len(prims)}'
    nv0 = gltf['accessors'][prims[0]['attributes']['POSITION']]['count']
    nt0 = gltf['accessors'][prims[0]['indices']]['count'] // 3
    nv1 = gltf['accessors'][prims[1]['attributes']['POSITION']]['count']
    nt1 = gltf['accessors'][prims[1]['indices']]['count'] // 3
    assert (nv0, nt0) == (3, 1), f'GunMesh prim0: expected 3v/1t, got {nv0}v/{nt0}t'
    assert (nv1, nt1) == (356, 286), f'GunMesh prim1: expected 356v/286t, got {nv1}v/{nt1}t'
    mesh['primitives'] = [prims[1]]
    print('[repair] leo2_revolution: GunMesh prim0 dropped (3v/1t degenerate wing-front sliver)')


def drop_gun_tube_vlo(gltf):
    """batch-43 op 3: vehicle#gun_tube_vlo mesh ref dropped (ONE degenerate
    triangle along the tube, z -6.041..-1.122 — batch-41 chassis_vlo literal
    class; node keeps its transform)."""
    removed = 0
    for n in gltf['nodes']:
        if n.get('name') == 'vehicle#gun_tube_vlo' and 'mesh' in n:
            nv = gltf['accessors'][gltf['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']]['count']
            assert nv == 3, f'gun_tube_vlo: expected 3v, got {nv}'
            del n['mesh']
            removed += 1
    assert removed == 1, f'expected exactly 1 vehicle#gun_tube_vlo mesh node, removed {removed}'
    print('[repair] leo2_revolution: vehicle#gun_tube_vlo mesh ref dropped (vlo sliver)')


# ------------------------------------------------------------ rule sets -----
# _index_surgery boxes in glb-WORLD units ((x0,x1,y0,y1,z0,z1), min_dx, min_dz)
# on TurretMesh prim0. glb frame here: +z = REAR (gate w = -z*0.904456+0.541),
# gate x = -glb x * 0.904456, norm y = (glb y + 1.108) * 0.904456.
RULESETS = {
    # a: FORE wing only — the center-fore strip past the pancake nose
    #    (z <= -1.95 glb = gate w >= +2.30) + the fore-side shelves
    #    (|x| >= 1.32, z -1.90..-1.20).
    'a': {
        'delete_rules': [
            ((-1.00, 1.00, 0.95, 1.35, -3.00, -1.95), 0, 0),   # fore center strip
            ((-2.00, -1.32, 0.95, 1.35, -1.90, -0.05), 0, 0),  # fore-side shelf +gate-x
            ((1.32, 2.00, 0.95, 1.35, -1.90, -0.05), 0, 0),    # fore-side shelf -gate-x
        ],
    },
    # b: a + the full floating side shelf over the hull body (z to +1.25)
    'b': {
        'delete_rules': [
            ((-1.00, 1.00, 0.95, 1.35, -3.00, -1.95), 0, 0),
            ((-2.00, -1.32, 0.95, 1.35, -1.90, 1.25), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, 1.25), 0, 0),
        ],
    },
    # c: b + aft outboard beyond the print's own basket rail line
    #    (norm ±1.4 = glb ±1.55): z +1.25..+3.35, |x| >= 1.56
    'c': {
        'delete_rules': [
            ((-1.00, 1.00, 0.95, 1.35, -3.00, -1.95), 0, 0),
            ((-2.00, -1.32, 0.95, 1.35, -1.90, 1.25), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, 1.25), 0, 0),
            ((-2.00, -1.56, 0.95, 1.35, 1.25, 3.35), 0, 0),
            ((1.56, 2.00, 0.95, 1.35, 1.25, 3.35), 0, 0),
        ],
    },
    # d: c but aft outboard from the shelf edge 1.32 (full wing ring)
    'd': {
        'delete_rules': [
            ((-1.00, 1.00, 0.95, 1.35, -3.00, -1.95), 0, 0),
            ((-2.00, -1.32, 0.95, 1.35, -1.90, 3.35), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, 3.35), 0, 0),
        ],
    },
    # e: shelves both sides, NO tail strip (stations-safe cand-a variant)
    'e': {
        'delete_rules': [
            ((-2.00, -1.32, 0.95, 1.35, -1.90, -0.05), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, -0.05), 0, 0),
        ],
    },
    # g: FULL floating ring at |x|>=1.32, all z, NO tail strip
    'g': {
        'delete_rules': [
            ((-2.00, -1.32, 0.95, 1.35, -1.90, 3.35), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, 3.35), 0, 0),
        ],
    },
    # h: e + the +-1.72-col corner-tab nubs (glb z +0.55..+1.15 outboard)
    'h': {
        'delete_rules': [
            ((-2.00, -1.32, 0.95, 1.35, -1.90, -0.05), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, -0.05), 0, 0),
            ((-2.00, -1.60, 0.95, 1.35, 0.55, 1.15), 0, 0),
            ((1.60, 2.00, 0.95, 1.35, 0.55, 1.15), 0, 0),
        ],
    },
    # i: e + corner-tab nub plates (glb |x| 1.70..2.00, z +1.20..+1.60 —
    #    the six-per-side floating plates; the basket RAILS span z -0.105..
    #    +3.631 and can never sit fully inside, so they survive by design)
    'i': {
        'delete_rules': [
            ((-2.00, -1.32, 0.95, 1.35, -1.90, -0.05), 0, 0),
            ((1.32, 2.00, 0.95, 1.35, -1.90, -0.05), 0, 0),
            ((-2.00, -1.70, 0.95, 1.35, 1.20, 1.60), 0, 0),
            ((1.70, 2.00, 0.95, 1.35, 1.20, 1.60), 0, 0),
        ],
    },
    # CALIBRATION probes (frame-mapping differentials, not landing candidates)
    'fore-strip': {   # box1 only: glb z -3.0..-1.95, x +-1.0
        'delete_rules': [((-1.00, 1.00, 0.95, 1.35, -3.00, -1.95), 0, 0)],
    },
    'left-shelf': {   # glb +x fore shelf only
        'delete_rules': [((1.32, 2.00, 0.95, 1.35, -1.90, -0.05), 0, 0)],
    },
    'aft-band': {     # aft outboard both sides
        'delete_rules': [((-2.00, -1.32, 0.95, 1.35, 1.25, 3.35), 0, 0),
                         ((1.32, 2.00, 0.95, 1.35, 1.25, 3.35), 0, 0)],
    },
}

# tube guard: GunMesh prim1 lives on the Gun node, NOT TurretMesh — but a
# greedy fore box could reach the tube corridor if TurretMesh carried tube
# fragments. Guard box = the tube corridor through the fore boxes' z range;
# expect_gun=(0,0,0) REFUSES to write if anything in TurretMesh prim0 sits
# fully inside it (and the overlap check refuses if a delete box also grabs
# it). Zero matches = no mutation (no GunMesh/Gun node is created).
GUN_GUARD = [((-0.30, 0.30, 0.85, 1.20, -6.10, -2.95), 0, 0)]


def main(argv):
    rules_key = next((a.split('=', 1)[1] for a in argv if a.startswith('--rules=')), 'a')
    out = next((a.split('=', 1)[1] for a in argv if a.startswith('--out=')),
               'shots/leo-wingex/candidate.glb')
    ops = next((a.split('=', 1)[1] for a in argv if a.startswith('--ops=')),
               'surgery,prim0,vlo').split(',')
    dry = '--dry' in argv
    expect = None
    for a in argv:
        if a.startswith('--expect='):   # parts,verts,tris
            expect = tuple(int(x) for x in a.split('=', 1)[1].split(','))

    gltf, chunks = RO.read_glb(SRC)

    if 'surgery' in ops:
        surgery = RO._index_surgery('leo2_revolution', 'TurretMesh', prim_index=0,
                                    delete_rules=RULESETS[rules_key]['delete_rules'],
                                    gun_rules=GUN_GUARD,
                                    expect_delete=expect,
                                    expect_gun=(0, 0, 0))
        surgery(gltf, chunks)
        if dry:
            print('[dry] ops ran in memory; no file written')
            return
    if 'prim0' in ops:
        drop_gunmesh_prim0(gltf)
    if 'vlo' in ops:
        drop_gun_tube_vlo(gltf)
    outp = Path(out)
    outp.parent.mkdir(parents=True, exist_ok=True)
    RO.write_glb(outp, gltf, chunks)
    print(f'[mkglb] rules={rules_key} ops={",".join(ops)} -> {outp} ({outp.stat().st_size} bytes)')


if __name__ == '__main__':
    main(sys.argv[1:])
