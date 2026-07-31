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
#   blender -b --python tools/repair_oracles_blender.py -- retag <id>
#   blender -b --python tools/repair_oracles_blender.py -- rerig <id>
#
# `repair` reads public/models/tanks/community/recovered/<id>.glb.bak (created
# from the shipping file on first run) and rewrites <id>.glb.
# `retag` (batch-3) re-groups fused/mis-parented rigs IN PLACE — no lifts, no
# parking: see RETAG_RECIPES.
# `rerig` (batch-6) bakes a skinned single-mesh armature at its rest pose and
# splits the static result by dominant bone weight into hull / turret / gun
# subtrees the gate's setPart() can separate: see RERIG_RECIPES.
import bpy
import bmesh
import shutil
import sys
from pathlib import Path
from mathutils import Matrix, Vector

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


# ------------------------------------------------------- retag recipes -----
# Batch-3 mode: IN-PLACE re-grouping only. Nothing is translated, lifted or
# parked — parts stay at their authored world positions and only change which
# articulation subtree owns them. Two op kinds work at loose-part / vertex-
# region granularity (for material-merged or fused skins); 'parent' moves a
# whole node. All boxes are glb-world [x0,x1, y0,y1, z0,z1] as printed by
# `dump`.
#
#   ('parent', child, parent)
#       hang an existing object under another, world transform preserved.
#   ('carve_parts', source, rules, dest, parent|None)
#       separate(LOOSE) the source mesh, classify each loose part by its
#       world bbox, join every match into `dest` (parented under `parent`),
#       join the rest back under the original source name. rules is a list;
#       a part matches if ANY rule matches:
#         ('center', box)      part bbox centre inside box
#         ('bbox', box, pad)   part bbox inside box grown by pad
#   ('carve_region', source, box, dest, parent|None)
#       vertex-region separate (duplicates the boundary ring only) — for
#       continuous shells that cross an articulation boundary, e.g. a turret
#       interior liner that dives below the ring plane. parent=None leaves
#       the carved piece a scene root.
#
# 'src': 'bak' rebuilds from <stem>.glb.bak (created on first run — the
# whole repair lives in this file). 'src': 'current' layers on the shipping
# file as-is (used when tools/repair_oracles.py owns step 1 — re-run that
# first for a from-scratch rebuild; carve ops are no-ops when already cut).
RETAG_RECIPES = {
    # leopard2_proto: NO RECIPE — assessed unrepairable by rigid means
    # (batch-3). The m_bergman print's TurretMesh is ONE fully-connected
    # component spanning the entire vehicle (x 0..29, y 0..21.4, z 0..84.7
    # model units, hull walls at 18.85): the turret is genuinely melted to
    # deck level (rises 2.5 units where a Leopard 2 turret needs ~8) and the
    # gun is a bar printed at deck height. There is no displaced authored
    # turret anywhere in the file to move onto the ring — unlike the UK
    # prints there are no loose parts at all. Any "repair" would mean
    # sculpting new geometry. Stays a documented oracle cap
    # (docs/references/tanks/leopard2_proto.md TURRET+GUN ORACLE CAP).

    # tiger2-maximus (community/, not recovered/): 20 flat material-merged
    # Object_N meshes; turretNode ^Object_2$ (turret+gun fused, explicit
    # cfg.pivot). docs/references/tanks/tiger2.md ORACLE CAP: mantlet collar
    # (z 0.42..1.09 world, to y 2.6), cupola drum band (z -1.10..-1.72, to
    # y 3.15) and the aerial/rod farm (z -2.0..-3.4, y 2.6..2.95) are baked
    # into HULL meshes and hover in mid-air when Object_2 yaws (baseline
    # board: the collar ring floats at the bow at yaw 180).
    #   Object_4  = turret furniture mesh (periscopes, collar face plates,
    #               bustle antenna, cupola bits) — every loose part is in the
    #               turret zone -> whole node onto the turret.
    #   Object_10 = the aerial/bracket cluster (x +-1.05, y 2.26..2.87,
    #               z -3.17..-2.24) -> whole node onto the turret.
    #   Object_8 / Object_9 mix hull plating with collar/cupola/aerial
    #               pieces -> loose-part carve:
    #     rule A ('center'): y > 2.55 inside z -3.45..0.30 — cupola drum
    #            pieces, roof plates, aerial bits. Hull tops out at 2.12
    #            there (deck) so nothing legitimate matches.
    #     rule B ('bbox'):  the collar box x -0.52..0.38, y 1.98..2.85,
    #            z 0.26..1.40 — collar rings/plates. Hull roof under it
    #            stays y <= 2.0 (parts at 1.96..2.01 tested OUT).
    #   Names: carved joins are 'Turret_Extras_8/9' — deliberately NOT
    #   Object_N so the loader's tiger2 gear regexes (^Object_(14|15|18|19)$
    #   etc.) and the Object_2 vertex split can never collide with them.
    # BATCH-7 AUDIT (no further ops): both v9 repair candidates in
    # docs/references/tanks/tiger2.md resolved to NO-OP — (a) the 2.5-2.8 m
    # hull-mask "intake tower" at z -2.1..-3.4 is a genuine centreline
    # deep-wading tower standing on the engine deck (Object_9 loose parts
    # v=18/14/11, x -0.34..0.39, z -3.16..-3.46, top y 2.714 — 38 mm UNDER
    # the turret bustle's y 2.752 swing plane; it must stay hull-side);
    # (b) the "nose-up rake" is a mis-read: the track-bottom profile is
    # flat at y 0.000..0.003 over z -3.1..+1.1 in .bak and shipping alike
    # (a 1 deg pitch would slope that 4.2 m patch 73 mm) — the front wheel
    # run is simply authored curling up from z ~+1.2. Full derivation in
    # tools/repair_oracles.py "tiger2 (batch 7)".
    'tiger2': {
        'file': 'tiger2-maximus',
        'dir': 'community',
        'src': 'bak',
        'ops': [
            ('parent', 'Object_4', 'Object_2'),
            ('parent', 'Object_10', 'Object_2'),
            ('carve_parts', 'Object_8', [
                ('center', (-1.10, 1.10, 2.55, 3.40, -3.45, 0.30)),
                ('bbox', (-0.52, 0.38, 1.98, 2.85, 0.26, 1.40), 0.02),
            ], 'Turret_Extras_8', 'Object_2'),
            ('carve_parts', 'Object_9', [
                ('center', (-1.10, 1.10, 2.55, 3.40, -3.45, 0.30)),
                ('bbox', (-0.52, 0.38, 1.98, 2.85, 0.26, 1.40), 0.02),
            ], 'Turret_Extras_9', 'Object_2'),
        ],
    },
    # leo2a5 phase 2 (phase 1 = tools/repair_oracles.py absorbs the stranded
    # wedge/roof fittings into Turret/Gun — run it first). Residuals proven
    # by docs/geometry-gate/leo2a5.json after phase 1:
    #  * side turret curve: refBot ~1 unit under procBot across the ring
    #    columns — the Turret mesh's own interior floor/basket (y 0.80..1.62,
    #    z -1.82..1.45) hangs below the deck line in the turret mask. Carve
    #    at y 1.62 (shell walls stop at 1.65, so only the liner moves) and
    #    leave the lower liner a hull-side root: it is entirely inside the
    #    hull tub silhouette (x +-1.5 < 1.83, y 0.80..1.62 < 1.99), i.e.
    #    mask-neutral where it now lives.
    #  * NOT carved — the rear stowage frame fused in 'vehicle#x_root_107'
    #    (x +-1.64, y 0.74..1.82, z -4.15..-2.0 overhanging the tail): a
    #    trial carve onto the turret was REVERTED. When yawed 180 deg the
    #    frame impales the glacis (it is authored at deck-to-skirt height —
    #    a real 2A5 bustle rack rides high exactly so it clears the deck),
    #    so it is Strv-pattern HULL rear stowage, not the turret rack the
    #    round-2 audit guessed. The proc's own full-width turret rack vs
    #    this hull frame stays a documented plan-view cap (~17).
    'leo2a5': {
        'file': 'leo2a5',
        'src': 'current',
        'ops': [
            ('carve_region', 'Turret', (-2.0, 2.0, -1.0, 1.62, -4.3, 3.0),
             'vehicle#turret_liner_low', None),
            # phase 3 (batch-6). Post-phase-2 hull census (loose-part dump of
            # x_root_107): the wedge fragments + the 4.0 m whips the round-3
            # cert flagged are ALREADY turret-side — the one hull-side part
            # left above the deck line is a thin aerial ROD on the rear
            # stowage frame (2 loose parts, 26 verts: shaft y 1.871..2.333 +
            # tip knob to y 2.347, x -0.09, z -4.15..-4.04). It tops the hull
            # mask at the tail columns (gate hull y-max 2.378 vs deck ~1.9).
            # The frame it stands on stays HULL (batch-3 certified Strv-
            # pattern rear stowage). Repair: carve the rod and fold it +90deg
            # about its base line (stowed whip) — it lies forward along the
            # frame top (y 1.87..1.98, z -4.04..-3.57), inside the frame/deck
            # band in every mask view. center-rule box floor y 1.95 proven:
            # the nearest frame-top knob centers at y 1.8675.
            ('carve_parts', 'vehicle#x_root_107', [
                ('center', (-0.15, -0.02, 1.95, 2.40, -4.20, -3.95)),
            ], 'vehicle#aerial_stowed', None,
             {'fold': (90.0, [0.0, 1.871, -4.037])}),
        ],
    },
    # leo2_revolution (batch-6). GATE-V9 cert: "gun fused into the hull node"
    # — plan/side hull masks run to the muzzle (+4.9 gate frame), plan
    # registration dy -0.18, stations out of phase. Loose-part dump of the
    # hull-side 'chassis_vlo' node (4218 parts): the ONLY muzzle-reaching
    # content is one degenerate 3-VERTEX LINE along the bore (x -0.015..
    # 0.026, y 1.005..1.016, z -6.041..-1.122 glb-world) fused into the
    # material-.1 primitive; every other part stops at the bow (z -3.752).
    # The articulated GunMesh tube (y 0.81..1.07, x +-0.15) fully contains
    # the line's silhouette, so re-homing it under `Gun` is mask-neutral
    # inside the tube and it elevates with the rig. 'reach' rule: only a
    # part crossing z -5.5 matches — nothing else in the file reaches past
    # the bow. Origins restored post-export (authored ring / trunnion, from
    # the pristine node tree; the Gun pivot is authored 0.84 left + 0.68 up
    # — x is irrelevant to a pitch axis, preserved exactly regardless).
    'leo2_revolution': {
        'file': 'leo2_revolution',
        'src': 'bak',
        'ops': [
            ('carve_parts', 'chassis_vlo', [
                ('reach', (-0.05, 0.06, 0.97, 1.05, -6.06, -1.10), 0.012, -5.5),
            ], 'vehicle#gun_tube_vlo', 'Gun'),
        ],
        'restore_origins': [
            ('Turret', [-0.013006508350372314, 0.713523805141449, 0.47113943099975586]),
            ('Gun', [-0.8423629999160767, 0.6801067590713501, -1.1223750114440918]),
        ],
    },
    # leo2a7v (desirefx print; turretNode ^desirefx_me_003$). The scan +
    # baseline board read: me_003 is a COMPLETE flat A7V turret (roof
    # plateau, bustle deck, side wedge bins, mast farm, fused L/55 authored
    # drooping to the fender line) — but it is authored SUNKEN: roof plateau
    # y 0.96 vs hull deck plates y 0.83 (0.13 proud instead of ~0.57), walls
    # burying to y 0.17 through the sponson band. The round-3 audit read
    # those buried walls as "hull-side armor and sponson courses" — solo
    # yaw cells show they are the turret's own skin. Additionally the
    # commander plinth / EMES tower (y 0.85..1.25 over z -0.55..0.55) is
    # authored in the HULL mesh me_002 — taller than the sunken roof, it
    # impales the turret at every yaw angle.
    # Repair, rigid only:
    #  * authored-origin: park me_003's node origin on the ring axis
    #    (x 0, z -0.40 = roof-plateau centre; the old footprint fallback sat
    #    at z +1.16 because the fused L/55 drags the bbox bow-ward, so the
    #    yaw circle orbited a point ahead of the hull centre),
    #  * carve the plinth out of me_002 and hang it on the turret at its
    #    authored height (its base sits on the sunken roof exactly as
    #    printed) — it now yaws with the shell instead of impaling it.
    # NOT done — lifting the turret onto the deck race (+0.44): verified
    # geometrically correct, but the mast farm fused into me_003 already
    # drives the loader's height-limited normalization; lifting it grew the
    # box 3.47 -> 3.91 and pushed the lab's width re-normalization into its
    # 1.65 safeScale clamp — the whole reference rendered ~4% narrow and
    # every gate component (hull included) collapsed to 0. The sunken seat
    # stays a documented print defect; the procedural 2A7V was deliberately
    # built to this print's own chunky frame (docs r3 notes), so the masks
    # still compare like for like.
    'leo2a7v': {
        'file': 'leo2a7v',
        'src': 'bak',
        'ops': [
            ('set_origin', 'desirefx_me_003', (0.0, 0.90, -0.40)),
            ('carve_region', 'desirefx_me_002',
             (-1.0, 1.0, 0.845, 1.35, -0.65, 0.65), 'TurretRoofPlinth', None),
            ('parent', 'TurretRoofPlinth', 'desirefx_me_003'),
        ],
    },
    # merkava2b phase 2 (phase 1 = tools/repair_oracles.py — run it first).
    # 'vehicle#turret_inside_46' is the casting interior + crew-tunnel liner
    # (y 0.61..2.59): physically it yaws with the casting (phase 1 parents it
    # under Turret), but its below-ring half also drops the reference turret
    # side-mask bottom a full metre under the procedural's (gate worst
    # columns refBot -1.84 vs procBot -0.75). Split it at the ring plane
    # y 1.70 (casting shell bottoms at 1.57 stay): the upper liner keeps
    # riding the turret hidden inside the casting silhouette, the lower
    # tunnel half returns to the hull where it is entirely inside the tub
    # (x +-1.40 < 1.94, y 0.61..1.70 < 1.85) — mask-neutral on both sides.
    'merkava2b': {
        'file': 'merkava2b',
        'src': 'current',
        'ops': [
            ('carve_region', 'vehicle#turret_inside_46',
             (-1.6, 1.6, 0.0, 1.70, -3.2, 1.2),
             'vehicle#turret_inside_low', None),
        ],
    },
}

# ---------------------------------------------------- merkava batch 4 -------
# Phase 2 for merkava1b/2d/3b/3c/3d/4b (phase 1 = tools/repair_oracles.py —
# ALWAYS run it first; it rebuilds from the pristine .bak, so this carve is
# re-applied on top of a fresh phase-1 output). Unlike merkava2b, these six
# fuse the crew-basket interior INTO the Turret mesh itself, so the split
# runs on 'Turret' directly. Loose-part dumps prove the below-ring content
# is a compact tunnel/basket interior that never touches the basket rails or
# the chain curtain (chains bottom out ~y 1.9 and start ~1 m behind every
# box's rear face):
#   1b/2d interior x ±1.14  y 0.61..1.60  z -1.87..+0.42 (ring discs at
#         y 1.5742 / 1.6998; casting side walls bottom exactly ON 1.6998)
#   3b/3c/3d interior x -1.06..0.92  y 0.60..1.59  z -1.80..+0.27
#   4b interior x -0.99..1.00  y 0.66..1.58  z -1.34..+0.64
# The cut plane is y 1.60: everything WHOLLY below it is interior-only
# (proven by the census), the handful of straddling seat/periscope posts are
# bisected exactly on the plane, and the 1.60..1.70 liner ring band that
# stays turret-side is hidden inside the casting silhouette (hull deck line
# 1.63..1.79 on all six). The lower tunnel becomes a hull-side root fully
# inside the hull tub in every mask view — the reference turret side-mask
# bottom returns from ~0.6 to the ring line (gate worst columns pre-repair:
# refBot ~1.1 m under procBot through the ring zone). Turret bbox is
# unchanged by the carve (interior is strictly interior), so the autoPivot
# footprint fallback does not move.
for _id, _box in {
    'merkava1b': (-1.30, 1.30, 0.0, 1.60, -2.00, 0.60),
    'merkava2d': (-1.30, 1.30, 0.0, 1.60, -2.00, 0.60),
    'merkava3b': (-1.20, 1.20, 0.0, 1.60, -1.95, 0.45),
    'merkava3c': (-1.20, 1.20, 0.0, 1.60, -1.95, 0.45),
    'merkava3d': (-1.20, 1.20, 0.0, 1.60, -1.95, 0.45),
    'merkava4b': (-1.15, 1.15, 0.0, 1.60, -1.50, 0.80),
}.items():
    RETAG_RECIPES[_id] = {
        'file': _id,
        'src': 'current',
        'ops': [
            ('carve_region', 'Turret', _box, 'vehicle#turret_inside_low', None),
        ],
    }

# ---------------------------------------------------- chieftain5 (batch 5) --
# SPLIT-RIG PRINT, phase 2. Phase 1 (tools/repair_oracles.py batch-2) built
# the Turret/Gun rig by re-grouping mesh#0's material prims: the Turret node
# holds the saucer shell (Turret_995: crown + cupola dome + searchlight
# housing + flank-rack WALLS + bustle basket) + masts (Gear_921) + the L11.
# RE-RUN ORDER: python `repair chieftain5` first (rebuilds phase 1 from the
# pristine .bak — the recipe guards against running on a non-pristine input),
# THEN this retag ('src': 'current' layers on the phase-1 output).
# Residual defect (docs/references/tanks/chieftain5.md v6/v7 cert "SPLIT-RIG
# ORACLE": casting waist / collar band / cupola glass / IR searchlight face
# read in the HULL mask): the fused hull-root mesh 'Chieftain MK-5 Main
# Battle Tank' (2071 loose parts: Gear_938/Glass_996/Applique_155/Hull_361/
# SideSkirts_361) still carries ~290 physically TURRET-BORNE parts that stay
# frozen at yaw (baseline board, turret 180: the chin casting + smoke
# dischargers still face the bow while the crown yaws away). Loose-part
# census + solo colour renders (batch-5 scratch classifier) prove four
# clean center-in-box families, glb-world (x width, y long axis with the
# ring at y=0 and the bow at -y, z up; deck plates top z 74..75.3):
#   1. chin/cheek casting band + discharger banks + searchlight face +
#      cupola/periscope glass + waist kit: (-67, 67, -45, 78, 75.5, 130)
#      — 280 parts, union x -65.7..46.5  y -14.2..81.8  z 75.0..119.4;
#      nothing hull-legit matches (deck kit centers sit z <= 74.9, glacis
#      zone y < -45 has zero parts above z 72).
#   2. RIGHT flank-rack CONTENTS (strapped duffels/box between the
#      TurretMesh rack walls x 36..69.8 y 81..145.7): (34, 63, 82, 146, 77, 104)
#   3. LEFT rack trim/straps (same rack, x -66.6..-44.7 walls):
#      (-63, -34, 82, 146, 76.5, 102.5) — excludes the deck-edge handrail
#      at x -65..-63 (center x -64, outside the box).
#   4. crown-rear cable run at z ~105 (the cert's "ring collar 2.43 m" band):
#      (-46, -4, 78, 110, 102, 109)
# All joins land in ONE 'TurretWaist' object hung under the Turret empty with
# world transform preserved (absorb world-exactly, no lifts). The Turret node
# ORIGIN (authored ring centre 0,0,74) is untouched, so the loader's
# autoPivot origin branch — and the articulation frame — do not move.
RETAG_RECIPES['chieftain5'] = {
    'file': 'chieftain5',
    'src': 'current',
    'ops': [
        ('carve_parts', 'Chieftain MK-5 Main Battle Tank', [
            ('center', (-67.0, 67.0, -45.0, 78.0, 75.5, 130.0)),
            ('center', (34.0, 63.0, 82.0, 146.0, 77.0, 104.0)),
            ('center', (-63.0, -34.0, 82.0, 146.0, 76.5, 102.5)),
            ('center', (-46.0, -4.0, 78.0, 110.0, 102.0, 109.0)),
        ], 'TurretWaist', 'Turret'),
    ],
    # the python phase authored these pivot origins (ring centre / trunnion);
    # the export round-trip flattens empties to the world origin, which would
    # flip the loader's autoPivot origin branch to the gun-dragged footprint
    # fallback. Parent-first order.
    'restore_origins': [('Turret', [0.0, 0.0, 74.0]), ('Gun', [-4.7, 6.0, 85.0])],
}


# ------------------------------------------------------ type74 (batch 6) ----
# GATE-V9 cert (docs/references/tanks/type74.md): the NullOps print is a
# skinned armature whose bones (Tower_9 yaw > Gun_7 pitch, wheels) carry no
# meshes — the whole tank is skinned layer meshes under one skin, so the
# gate's setPart() subtree split reads hull == whole and an EMPTY turret mask
# (hull/whole/turret/stations certified 0). The bones DO articulate at
# runtime, but mask ownership follows the mesh-node ancestry, not bones.
#
# Repair = mechanical RE-RIG (no geometry invention): bake the armature at
# its authored pose (imported pose == rest pose, asserted below, so the bake
# reproduces the bind geometry exactly), split each of the 5 layer meshes by
# DOMINANT BONE WEIGHT into hull / turret / gun face sets (majority vote per
# face; gun > turret > hull on ties so articulated parts stay intact — the
# batch-6 weight census: Object_7 hull+wheels only, Object_8 = 8966 Hull /
# 8956 Tower_9 / 4050 Gun_7 / 3287 Turret_8, Object_9 = 1230 Tower_9 / 860
# Hull, Object_10 = 646 Hull / 32 Gun_7, Object_12 pure hull; only 666 verts
# carry any secondary weight >0.01, so the dominant-bone boundary is sharp),
# then rebuild the static node tree the loader's registration expects:
# 'Tower_9' empty (authored yaw-bone head = ring axis) holding the turret
# pieces + 'Gun_7' empty (pitch-bone head = trunnion) holding the gun pieces;
# hull pieces stay scene roots. Config regexes (^Tower_9$ / ^Gun_7$,
# LOCAL_REFERENCE_OVERRIDES) resolve the empties; scaleToOverall keeps the
# same normalization as the skinned original.
RERIG_RECIPES = {
    'type74': {
        'file': 'type74-nullops',
        'dir': 'community',
        'turret_bones': ('Tower_9', 'Turret_8'),
        'gun_bones': ('Gun_7',),
        'origins': ('Tower_9', 'Gun_7'),   # empties, parented in this order
    },
}


def run_rerig(tank_id):
    recipe = RERIG_RECIPES[tank_id]
    stem = recipe.get('file', tank_id)
    base = ROOT / 'public' / 'models' / 'tanks' / recipe['dir'] \
        if 'dir' in recipe else RECOVERED
    src = base / f'{stem}.glb'
    bak = base / f'{stem}.glb.bak'
    if not bak.exists():
        shutil.copy2(src, bak)
    # NO transform_apply on import: the armature must keep its pose/rest
    # relationship until the bake; transforms are applied per-piece after.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(bak))
    bpy.context.view_layer.update()

    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    # Assert the imported pose IS the rest pose — then applying the armature
    # modifier reproduces the authored bind geometry exactly (world-exact).
    for pb in arm.pose.bones:
        basis = pb.matrix_basis
        assert max(abs(basis[i][j] - (1.0 if i == j else 0.0))
                   for i in range(4) for j in range(4)) < 1e-5, \
            f'{pb.name}: posed away from rest — bake would move geometry'
    bone_world = {}
    for name in recipe['origins']:
        head = arm.matrix_world @ arm.data.bones[name].head_local
        bone_world[name] = to_glb(head)
        print(f'[rerig] {tank_id}: bone {name} head glb-world '
              f'({bone_world[name][0]:.6f}, {bone_world[name][1]:.6f}, '
              f'{bone_world[name][2]:.6f})')

    gun_bones = set(recipe['gun_bones'])
    turret_bones = set(recipe['turret_bones'])
    meshes = [o for o in bpy.data.objects if o.type == 'MESH'
              and any(m.type == 'ARMATURE' for m in o.modifiers)]
    out = {'turret': [], 'gun': []}
    for obj in list(meshes):
        gi = {g.index: g.name for g in obj.vertex_groups}

        def vert_class(v):
            best, bw = None, -1.0
            for ge in v.groups:
                if ge.weight > bw:
                    best, bw = gi.get(ge.group), ge.weight
            if best in gun_bones:
                return 'gun'
            if best in turret_bones:
                return 'turret'
            return 'hull'

        classes = [vert_class(v) for v in obj.data.vertices]
        for cls in ('gun', 'turret'):        # gun first: tie-priority on
            if not any(c == cls for c in classes):     # boundary faces
                continue
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_mode(type='FACE')
            bpy.ops.mesh.select_all(action='DESELECT')
            bpy.ops.object.mode_set(mode='OBJECT')
            # majority vote per face; ties resolve to the articulated class
            # (gun before turret before hull) so mantlet-root rings never
            # strand hull-side. Face selection set in object mode, then
            # separated in edit mode.
            order = ('gun', 'turret', 'hull')
            for poly in obj.data.polygons:
                votes = {'gun': 0, 'turret': 0, 'hull': 0}
                for vi in poly.vertices:
                    votes[classes[vi]] += 1
                win = max(order, key=lambda k: (votes[k], -order.index(k)))
                poly.select = (win == cls)
            bpy.ops.object.mode_set(mode='EDIT')
            before = set(bpy.data.objects)
            bpy.ops.mesh.separate(type='SELECTED')
            bpy.ops.object.mode_set(mode='OBJECT')
            new = [o for o in bpy.data.objects if o not in before]
            if new:
                piece = new[0]
                piece.name = f'{obj.name}_{cls}'
                piece.data.name = piece.name
                out[cls].append(piece)
                print(f'[rerig] {tank_id}: {obj.name} -> {piece.name} '
                      f'({len(piece.data.vertices)} verts)')
            # vertex indices changed after separate — recompute classes
            classes = [vert_class(v) for v in obj.data.vertices]

    # bake: apply the armature modifier on every (still-skinned) mesh at the
    # asserted rest pose, then unparent keep-transform and flatten transforms.
    static = [o for o in bpy.data.objects if o.type == 'MESH']
    for obj in static:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for m in [m for m in obj.modifiers if m.type == 'ARMATURE']:
            bpy.ops.object.modifier_apply(modifier=m.name)
        mw = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = mw
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)   # armature+wrappers
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # rebuild the articulation tree: Tower_9 > (turret pieces, Gun_7 > gun
    # pieces); hull pieces stay scene roots. Origins land on the bone heads.
    empties = {}
    parent_of = {recipe['origins'][0]: None,
                 recipe['origins'][1]: recipe['origins'][0]}
    for name in recipe['origins']:
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.location = point_to_blender(bone_world[name])
        empties[name] = e
    bpy.context.view_layer.update()
    if parent_of[recipe['origins'][1]]:
        parent_keep_world(empties[recipe['origins'][1]],
                          empties[recipe['origins'][0]])
    bpy.context.view_layer.update()
    for piece in out['turret']:
        parent_keep_world(piece, empties[recipe['origins'][0]])
    for piece in out['gun']:
        parent_keep_world(piece, empties[recipe['origins'][1]])
    bpy.context.view_layer.update()

    bpy.ops.export_scene.gltf(filepath=str(src), export_format='GLB',
                              export_yup=True, export_apply=False)
    restore_origins(src, [(n, list(bone_world[n])) for n in recipe['origins']])
    print(f'[rerig] {tank_id}: -> {src} (pristine original at {bak.name})')


def world_bbox_min_max(obj):
    lo, hi = world_box(obj)
    return lo, hi


def rule_matches(part, rules):
    lo, hi = world_box(part)
    c = [(lo[i] + hi[i]) / 2 for i in range(3)]
    for rule in rules:
        kind, box = rule[0], rule[1]
        x0, x1, y0, y1, z0, z1 = box
        if kind == 'center':
            if x0 <= c[0] <= x1 and y0 <= c[1] <= y1 and z0 <= c[2] <= z1:
                return True
        elif kind == 'bbox':
            pad = rule[2] if len(rule) > 2 else 0.0
            if (lo[0] >= x0 - pad and hi[0] <= x1 + pad and
                    lo[1] >= y0 - pad and hi[1] <= y1 + pad and
                    lo[2] >= z0 - pad and hi[2] <= z1 + pad):
                return True
        elif kind == 'reach':
            # bbox inside the padded box AND extending past z_reach (rear
            # overhang test — separates tail-crossing racks from deck gear)
            pad, z_reach = rule[2], rule[3]
            if (lo[0] >= x0 - pad and hi[0] <= x1 + pad and
                    lo[1] >= y0 - pad and hi[1] <= y1 + pad and
                    lo[2] >= z0 - pad and hi[2] <= z1 + pad and
                    lo[2] <= z_reach):
                return True
        else:
            raise ValueError(f'unknown rule kind {kind}')
    return False


def parent_keep_world(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def bisect_box(obj, box):
    """Cut obj's mesh along every box face that passes through it.

    Coplanar cuts only — the surface is unchanged; this just guarantees the
    subsequent region carve separates exactly ON the box faces instead of
    wherever whole triangles happen to end.
    """
    lo, hi = world_box(obj)
    planes = []
    for axis in range(3):
        for v in (box[axis * 2], box[axis * 2 + 1]):
            if lo[axis] < v < hi[axis]:
                planes.append((axis, v))
    if not planes:
        return
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    for axis, v in planes:
        bpy.ops.mesh.select_all(action='SELECT')
        # glb axis -> blender world: x -> +x, y -> +z, z -> -y
        if axis == 0:
            co, no = (v, 0.0, 0.0), (1.0, 0.0, 0.0)
        elif axis == 1:
            co, no = (0.0, 0.0, v), (0.0, 0.0, 1.0)
        else:
            co, no = (0.0, -v, 0.0), (0.0, -1.0, 0.0)
        bpy.ops.mesh.bisect(plane_co=co, plane_no=no)
    bpy.ops.object.mode_set(mode='OBJECT')


def separate_loose(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    before = set(bpy.data.objects)
    bpy.ops.mesh.separate(type='LOOSE')
    return [obj] + [o for o in bpy.data.objects if o not in before]


def run_retag(tank_id):
    recipe = RETAG_RECIPES[tank_id]
    stem = recipe.get('file', tank_id)
    base = ROOT / 'public' / 'models' / 'tanks' / recipe['dir'] \
        if 'dir' in recipe else RECOVERED
    src = base / f'{stem}.glb'
    bak = base / f'{stem}.glb.bak'
    if not bak.exists():
        shutil.copy2(src, bak)
    load(bak if recipe.get('src', 'bak') == 'bak' else src)

    changed = False   # batch-6: only export when an op actually did work, so
                      # a fully-applied 'src: current' recipe re-runs as a
                      # byte-identical no-op instead of a jittery round-trip
    for op in recipe['ops']:
        if op[0] == 'parent':
            _, child, parent = op
            parent_keep_world(bpy.data.objects[child], bpy.data.objects[parent])
            changed = True
        elif op[0] == 'lift':
            # rigid world +y translate (blender +z). Applied via location so
            # it exports as the node's translation.
            _, name, dy = op
            bpy.data.objects[name].location.z += dy
            bpy.context.view_layer.update()
            changed = True
        elif op[0] == 'set_origin':
            # park the node origin on a glb-world point WITHOUT moving any
            # geometry (mesh data shifts by the inverse) — the loader's
            # autoPivot then uses the authored origin instead of a bbox
            # fallback. Only for parentless, unrotated (post-apply) objects.
            _, name, point = op
            obj = bpy.data.objects[name]
            assert obj.parent is None
            target = point_to_blender(point)
            delta = target - obj.location
            obj.data.transform(Matrix.Translation(-delta))
            obj.location += delta
            bpy.context.view_layer.update()
            changed = True
        elif op[0] == 'carve_parts':
            _, source, rules, dest, parent = op[:5]
            extras = op[5] if len(op) > 5 else {}
            if bpy.data.objects.get(dest) is not None:
                # idempotency guard (batch-6): the carve output already
                # exists, so the source no longer holds those parts — skip
                # the separate/join churn entirely.
                print(f'[retag] {tank_id}: {dest} already exists — skip')
                continue
            source_obj = bpy.data.objects[source]
            keep_parent = source_obj.parent
            pieces = separate_loose(source_obj)
            hits = [p for p in pieces if rule_matches(p, rules)]
            rest = [p for p in pieces if p not in hits]
            print(f'[retag] {tank_id}: {source} -> {len(hits)} part(s) '
                  f'to {dest}, {len(rest)} stay')
            if not hits:
                join(rest, source)
                continue
            changed = True
            dest_obj = join(hits, dest)
            rest_obj = join(rest, source)
            if keep_parent is not None and rest_obj is not None:
                parent_keep_world(rest_obj, keep_parent)
            # optional rigid stow fold: rotate the carved join about an
            # x-parallel world line ('fold': (angle_deg, [x, y, z] glb pivot);
            # glb +x == blender +x, so the angle carries over unchanged).
            # Applied to the carve output only — a re-run that matches 0
            # parts skips it, keeping 'src: current' recipes idempotent.
            if extras.get('fold'):
                import math
                angle_deg, pivot = extras['fold']
                pb = point_to_blender(pivot)
                mfold = (Matrix.Translation(pb)
                         @ Matrix.Rotation(math.radians(angle_deg), 4, 'X')
                         @ Matrix.Translation(-pb))
                dest_obj.matrix_world = mfold @ dest_obj.matrix_world
                bpy.context.view_layer.update()
                bpy.ops.object.select_all(action='DESELECT')
                dest_obj.select_set(True)
                bpy.context.view_layer.objects.active = dest_obj
                bpy.ops.object.transform_apply(location=True, rotation=True,
                                               scale=True)
            if parent:
                parent_keep_world(dest_obj, bpy.data.objects[parent])
        elif op[0] == 'carve_region':
            _, source, box, dest, parent = op
            if bpy.data.objects.get(dest) is not None:
                # batch-6 idempotency guard: on 'src: current' re-runs the
                # carved piece already exists as its own object; re-carving
                # only shaves the bisect ring off the old cut edge into a
                # vertex-less duplicate-named stub. Skip outright.
                print(f'[retag] {tank_id}: {dest} already exists — skip')
                continue
            source_obj = bpy.data.objects[source]
            # Bisect along the box faces that cut through the mesh first, so
            # faces straddling the region boundary split exactly ON it (the
            # cut is coplanar — surface shape is unchanged). Without this,
            # separate(SELECTED) leaves every straddling face behind and the
            # split line wanders a full triangle-height off the plane.
            bisect_box(source_obj, box)
            piece = carve(source_obj, box)
            if piece is None:
                print(f'[retag] {tank_id}: {source} region already cut — no-op')
                continue
            mw = piece.matrix_world.copy()
            piece.parent = None
            piece.matrix_world = mw
            piece.name = dest
            piece.data.name = dest
            changed = True
            if parent:
                parent_keep_world(piece, bpy.data.objects[parent])
        else:
            raise ValueError(f'unknown retag op {op[0]}')

    if not changed:
        print(f'[retag] {tank_id}: nothing to do — {src.name} left untouched')
        return
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(src), export_format='GLB',
                              export_yup=True, export_apply=False)
    restore_origins(src, recipe.get('restore_origins'))
    print(f'[retag] {tank_id}: -> {src} (pristine original at {bak.name})')


def restore_origins(src, wanted):
    """Re-park node ORIGINS on authored glb-world points after export.

    load() transform-applies every object, and empties (pure pivot nodes such
    as chieftain5's python-repair 'Turret'/'Gun') come out of the round-trip
    at the world origin — the loader's autoPivot origin branch (`to.y > 0.25`)
    would then fall back to the gun-dragged footprint centre and the
    articulation frame would move. This restores each named node's origin
    WITHOUT moving any geometry: node.translation = authored world point,
    every direct child compensated by the inverse. Requires (asserts) the
    exported file to be rotation-free on the touched paths — true for these
    baked exports. Runs on the GLB JSON via tools/repair_oracles.py helpers;
    idempotent, ordered parent-first.

    wanted: ordered list of (node_name, [wx, wy, wz]) in glb world coords.
    """
    if not wanted:
        return
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'repair_oracles', Path(__file__).resolve().parent / 'repair_oracles.py')
    ro = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ro)
    gltf, chunks = ro.read_glb(src)
    nodes = gltf['nodes']
    parent_of = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent_of[c] = i

    def world_of(idx):
        t = [0.0, 0.0, 0.0]
        while idx is not None:
            n = nodes[idx]
            assert 'rotation' not in n and 'matrix' not in n and 'scale' not in n
            nt = n.get('translation', [0, 0, 0])
            t = [t[k] + nt[k] for k in range(3)]
            idx = parent_of.get(idx)
        return t

    for name, point in wanted:
        idx = ro.find_node(gltf, name)
        node = nodes[idx]
        assert 'rotation' not in node and 'matrix' not in node
        parent_world = world_of(parent_of[idx]) if idx in parent_of else [0, 0, 0]
        old_local = node.get('translation', [0.0, 0.0, 0.0])
        new_local = [point[k] - parent_world[k] for k in range(3)]
        delta = [new_local[k] - old_local[k] for k in range(3)]
        node['translation'] = new_local
        for c in node.get('children', []):
            ct = nodes[c].get('translation', [0.0, 0.0, 0.0])
            nodes[c]['translation'] = [ct[k] - delta[k] for k in range(3)]
    ro.write_glb(src, gltf, chunks)
    print(f'[retag] origins restored: {[n for n, _ in wanted]}')


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
    e = 5e-4  # verts bisected exactly onto a box face must count as inside
    for v in bm.verts:
        g = to_glb(mw @ v.co)
        inside = (box[0] - e <= g[0] <= box[1] + e
                  and box[2] - e <= g[1] <= box[3] + e
                  and box[4] - e <= g[2] <= box[5] + e)
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

    if mode == 'retag':
        run_retag(argv[1])
        return

    if mode == 'rerig':
        run_rerig(argv[1])
        return

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
