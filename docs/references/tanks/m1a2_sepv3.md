# M1A2 SEPv3 (id: m1a2_sepv3) — reference packet

Variant: M1A2 SEPv3 — redesignated **M1A2C** September 2018; first shown AUSA
October 2015 (owner wiki reference, coordinator drop 2026-08-07). CREATED by
§5.07 owner order (2026-08-07): "right now just focus on remaking the sepv2
and sepv3 based on the current abrams platforms."

## Identity (wiki facts locked by the coordinator reference update)
- **CROWS-LP** low-profile RWS, resting FORWARD (CROWS-FORWARD law, §5.07
  order 2: "focus on making the crows machine guns point forward").
- **Ammunition Data Link (ADL)** — boxes on the roof; the spec row's
  reloadS edge.
- **IFLIR** — improved/larger thermal housings on the CITV + gunner's
  primary sight (the s3 = 1.16 housing scale in buildM1a2).
- **Trophy APS** launcher brackets on the turret sides + corner radar panels.
- **ARAT-class ERA** fit on the skirts.
- **UAAPU** — auxiliary power unit box, left-rear sponson.
- Updated **IFF panels** (split twin fronts + one rear).
- **XM1147 AMP** in the ammo load (spec row shell name; the base m1a2 row
  keeps the fielded 'M1147 AMP' name).

## Registration (roster only — NO oracle)
- Spec row: userdrops5.js `make('m1a2', 'm1a2_sepv3', 'M1A2 SEPv3', 'USA',
  { hp: 2700, weightTons: 67.5, gun: { reloadS: 5.8 }, community: null,
  visual: { number: '34' } })` + XM1147 AMP shell rename post-pass.
  community null — original procedural build, nothing recovered to credit.
- Profile: ABRAMS_PROFILES `m1a2_sepv3: { build: buildM1a2, sepv3: true }` —
  the m1a2 family rig's THIRD param delta (§H litmus: the whole variant is
  the V.sepv3 flag surface inside buildM1a2, no fork).
- **FALSE-0 LAW**: NO MODEL_SOURCE, NO harness-map rows, NO ledger row —
  never gate this id. Measures = §B8.1 four-box + 14-view self-shots.
- Mask split: works field TURRET-parented (the m1a2 §B5-correct
  arrangement — no worksHull flag).
- NAME COLLISION FLAG for the owner/orchestrator: specs.js still names the
  base m1a2 row "M1A2 Abrams SEPv3" (the dannzjs-era label). With this row
  shipping as "M1A2 SEPv3" the garage shows two SEPv3-named tanks — the base
  row wants a rename (owner call; specs.js is outside this lane's files).

## Measurement/influence source (owner-supplied local asset)
`public/models/tanks/m1a2_sepv3_dannzjs.glb` — probed OFFLINE this round
(scratchpad tmp-sepv3-glbprobe): AABB 4.844 × 3.29 × 13.024 raw,
29 meshes / 327k verts, TurretPivot/GunPivot articulation. Normalized to
width 3.66 its proportions read hull ~8.7 m (real 7.93, +10%), height
~2.9 (real 2.44, +20%) — consistent with the m1a2.md PROVENANCE CORRECTION
(the print is the adjudicated MISLABELED LEOPARD 2A5 with odd dimensions).
Per the §5.07 brief ("give it the m1a2's dims unless the GLB proves
different fits") the GLB proves NO different fit — **dims are the m1a2's
published 7.93 / 9.77 / 3.66 / 2.44**. The asset stays unregistered
(measurement influence only; ATTRIBUTION keeps its license record).

## Four-box (§B8.1 round-close probe, scratchpad tmp-sepv3-fourbox, this round)
- overall: 3.672 × 2.907 × 9.773 (x/y/z sizes; min y 0.005 ground)
- hull box: 3.672 wide × 7.932 long (published 3.66/7.93; width +0.33% =
  the ARAT tile proudness, inside the 1% grace — documented below)
- turret box: z −3.34..2.405 (rear IFF panel to cheek tips), top 2.907
- gun box: muzzle z 5.79 (overall 9.77 ✓), y 1.14..2.175 (sight band class)
- rig groups: rig_hull / rig_turret / rig_gun / rig_recoil / rig_muzzle ✓
- height datum: roof plateau at the 2.44 published height; the CROWS-LP
  mast tops 2.907 inside the station's 3 side columns (the family's
  owner-authorized RWS class). Vertex-replica p95 on the PROC-only grid
  reads 2.8605 (its grid phase differs from the gate-class shared box —
  4th column catches the station backplate); on the gate-class grid the
  station occupies 3 columns and p95 reads the 2.44 knee. §D DIMS-DATUM
  note: mast-inclusive reads above the roof datum are a datum question,
  not a shape defect (BUILD-STANDARD §B2 addendum).
- geometry hash 12ffb1f4 (44 meshes / 123456 verts, tmp-hashgeo).

## Build content (V.sepv3 surface, all sep3-gated in buildM1a2)
1. CROWS-LP station FORWARD (shared CROWS-FORWARD mechanics, see
   m1a1.md round home): LP wide-flat head + elevated M2 at rest yaw 0,
   receiver/can/yoke pinned in the station's 3-column window, barrel run
   shadow-named past it (§C mechanism).
2. IFLIR CITV pot + GPS doghouse at s3 = 1.16 scale (sep gets 1.0) —
   drum + head + thermal window / hood + aperture + glass, seated on the
   2.365 center band inside the station z-window.
3. Trophy APS: bracket posts on the sponson-panel tops + canted launcher
   boxes (dark countermeasure faces) both flanks + 4 radar panels
   (forward pair on sponson-wall fronts, rear pair on the rack flanks).
   Widest solid x 1.67 < the 1.83 anchor. Turret-parented (yaws).
4. ARAT-class ERA: 9×2 tile grid per skirt + top mounting rail + row/
   column seams, tile faces 6 mm proud (widthM 3.672 = +0.33%).
5. UAAPU sponson box left-rear (z −2.86..−2.42), top CAPPED 1.698 = 12 mm
   under the yawing works-crate bottoms (wC 1.71) whose sweep annulus
   covers the deck corner — yaw-90 pair proves no sweep clip; louver
   inset field + seams + outboard exhaust stub.
6. ADL boxes: two flat dark electronics boxes + conduit bridge on the M1
   right plateau (tops 2.445 ≤ the 2.4525 knee; clear of the loader M240).
7. Updated IFF panels: split twin panels both forward walls + one rear
   panel on the −3.325 rear tab face.
8. Loader M240 + shield (the m1a2 branch — NOT the sepv2's twin fifties),
   mid-deck tie-down ring pair, family §B3 kit (gun-run sleeve grammar,
   wind sensor, bow shoe stacks, bin grammar) inherited from buildM1a2.

## §H.4 distinctness (garage tells vs siblings)
sepv3 = CROWS-LP forward + Trophy flanks + ARAT skirt grid + APU sponson
hump + ADL boxes + split IFF panels + M240 loader. sepv2 = tall CROWS II
forward + twin fifties + CIP panels + deck tow cable + rigid rack crate +
rear-plate APU exhaust read. m1a2 = CROWS-LP + coil/links flanks, no
Trophy/ARAT. Number '34'.

## Self-shots (this round)
shots/sepv3-r1/self-m1a2_sepv3/ (14 views, proc-only on the tank-critic
camera rig) + shots/sepv3-r1/self-m1a2_sepv3-yaw90/ (yaw pair: Trophy/
IFF/rack furniture rotate; APU/ARAT/hull kit stay; no sweep clip).
CROWS-FORWARD read: view-left / close-roof / hero-frontleft show the M2
pointing at the bow.

## Honest residuals (first-round state, for the critic the orchestrator spawns)
- ARAT tiles are 6 mm relief (tone-grammar grid at garage range; true
  wedge depth would break the §D width anchor — inset-panel rework is the
  path if the owner wants deeper relief).
- APU box is the low-profile sponson hump (0.12 m tall) — the honest
  ceiling under the yawing works-crate sweep; a taller box needs the
  works crates re-seated first.
- Trophy rear radar panels sit on the rack flank rails — verify the
  attachment read at yaw in the critic round.
- No icons yet (icons are a §10/orchestrator artifact).
