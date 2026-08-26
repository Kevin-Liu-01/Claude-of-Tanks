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

## SEP REBUILD-ON-BASE ROUND (2026-08-07, abrams builder — §5.19 +
## §5.19a owner orders: "rebuild them to use the M1A2 abrams base model
## ... i meant the m1a2 abrams (ex tejas) is the correct base"; moves
## 12ffb1f4 — FALSE-0 id, never gated, no re-cert gate row exists)

### The rebase
Profile entry is now `{ build: buildTejasFamily, station: 'crowslp',
abramsKit: 'sepv3' }` — the M1A2C kit rides the TEJAS-GRADE platform
(hull loft + fender/corner/taillight furniture, wheel/suspension dress,
swept-cheek §B1 shell + raked left bulge, bustle basket, segmented M256
jacket + bore, rear + tone kits — everything the base-m1a2 fit lacked;
see the m1a2_sepv2.md audit this round). The buildM1a2 sep3 branches are
dead code (cleanup flagged, orchestrator lane).

### Kit reseat (M1A2C set on the tejas platform)
1. CROWS-LP FORWARD: tejasRoofKit station 'crowslp' — the family CROWS
   aim-frame with a SHORTER riser (hk -0.075) and the wide-flat LP head
   (0.26 x 0.145 pod vs the II's 0.20 x 0.195; top edge shared so the
   real gun-over-pod nest holds), apertures on the aim face, mast tops
   2.874w (the CROWS-LP class; sepv2's II-tall tops 3.02w — the §H.4
   pair splits at a glance).
2. IFLIR: s3 1.16 CITV pot (left-forward, in the station's 3-column
   window, faces to the 0.363 edge) + enlarged gunner's-sight optics
   (flank cheek plates widening the tejas doghouse + the bigger
   aperture band + glass).
3. TROPHY APS: camo-bodied launchers (dark countermeasure faces +
   louvered plates) canted on bracket posts through the roof-edge
   shelves, riding ABOVE the wall-band top line both flanks; 4 radar
   panels — forward pair on the wall/lip faces, rear pair on posts off
   the rack bottom side rails. Turret-parented (yaw pair proves the
   whole fit rotates).
4. ARAT 9x2 per skirt, REBUILT BETTER than the buildM1a2 fit: tiles
   ride the 1.812 skirt plane (inner faces ON it — §B2 no-air), outer
   faces 1.824 + pale M32 face plates to 1.8275 — INSIDE the ±1.828 tab
   anchor: ZERO width growth (the old fit read +0.33%); top mounting
   rail + row/column seams; the pale-face grammar makes the grid READ
   at garage range (family-strip proof).
5. UAAPU: real housing at the LEFT REAR CORNER deck (x -1.735..-1.39,
   top 1.966 — encloses the family grille pod; louver inset field +
   3 seams + outboard exhaust stub with collar + access panel). The old
   mid-sponson seat is a tejas-platform impossibility (the raised 1.81
   engine deck swallows a 1.698-capped box; the corner sits OUTSIDE the
   rack sweep, r >= 3.89 vs the 3.68 outer sweep — yaw-verified).
6. ADL boxes: two flat electronics boxes + conduit bridge on the right
   roof plate (tops 2.44w; clear of the loader ring r 0.243 + rear-roof
   blocks by measured margins).
7. Updated IFF: split twin panels both forward walls + rear panel HUNG
   ON the rack rear top rail (left segment; overlap-connected, face
   5 mm proud of the rail plane).
8. Loader M240 + shield: the family skate station (station != tall —
   the M240 branch), per the M1A2C fit.
9. §B3.2: stowed-MAG census fitting in the rackDufMul-freed RIGHT slot
   (muzzle toward the center duffel) + antenna pot, canvas satchel on
   the left duffel crown, pioneer tools right glacis (x <= 1.04 —
   inboard of the band inner face, the §B4 wrap-shell lesson), bow
   tow-shackle stations, mid-glacis ring pair, dual whip pods.

### §B8.1 four-box (probe tools/tmp-sep-fourbox.mjs, this round)
- overall 3.658 x 2.889 x 9.759 (published 3.66 w / 9.77 overall)
- hull box 3.656 wide x 7.925 long (published 3.66 / 7.93)
- turret top 2.874 = the LP mast (3-column class); roof plateau 2.44
- gun: muzzle z 5.788, tube y 1.56..2.14 (the real bore line)
- rigs rig_hull/turret/gun/recoil/muzzle all present
- WIDTH ANCHOR: widest solid ±1.828 (the family tab carriers) — the
  ARAT fit adds ZERO width (§D anchor honored by construction).

### Audits (final tree, clean-room worktree at HEAD be02f5d)
- standard-check: clip 0/0 ✓, contig 0 ✓, decor mg1+1d ✓ ("no gate
  json" line = the FALSE-0 law holding: never gate this id).
- track-clip --exact: 0/0 band + 0/0 shoe.
- turret-parent: 0/0/0 CLEAN.
- winding-audit: census reversed 0 / mixed 0, deficit 0; mode-2 325 px
  candidates = the APU corner housing + rear-deck furniture exposed at
  yaw (correctly hull-parented deck kit, the merkava tail-pack class —
  adjudicate LEAVE).
- npm test 166/166 + track-geometry green.

### Hash
12ffb1f4 -> **2c9023d0** (47 meshes / 170072 verts). FALSE-0: record
only, no gate row, no ledger row. Re-verified IDENTICAL at the delivery
tree f2720c2 (HEAD moved mid-round; abrams.js untouched upstream).

### Evidence
shots/sep-rebase-r1/self-m1a2_sepv3/ (14 views) +
yaw90-m1a2_sepv3/ (Trophy/IFF/radar/ADL rotate; ARAT/APU/hull kit stay)
+ family-strip/ (tejas | sepv2 | sepv3 — one platform, three kits).

### Honest residuals
- ARAT relief is 12-15 mm (tile body 1.824 + pale faces 1.8275 under
  the 1.828 anchor); real M32 shingles are ~90 mm — the §D width anchor
  still caps true depth; the pale-face grammar carries the read.
- Trophy launcher inner faces bury into the shell shoulder band (the
  §4.9999 connection); at some yaw angles the bracket posts read short
  from below — posts embed 65 mm into the roof-edge shelves.
- The LP head shares the II's aperture plate set at reduced heights —
  a dedicated LP-face texture pass is a future nicety.
- The prior round's "sponson hump" residual note is RETIRED (the
  housing moved to the corner station with real clearance).

## FLANK-PANEL PITCH BINDING (2026-08-08, owner order)
The shared bins/lips and Trophy radar faces now lie flush on the turret
tumblehome. FALSE-0 remains law: no oracle registration or gate row was
invented. Fresh proc-only 14-view identity sitting PASS, floor 9.1 / mean
9.20; Trophy/ARAT/APU/ADL and roof-kit reads survive. Binding
**2c9023d0 -> 329ec520** (47 meshes / 169064 verts). Full verdict:
the archived visual-review receipt.

## §5.74 DISTINCTIVENESS + P95 BINDING (2026-08-08)
SEPv3 is the current wide-low mark: massive LP CROWS, retained
ADL/IFLIR/Trophy/APU, fine 9x2 hull plus 5x2 turret micro-cassettes, and
deterministic physical olive foliage over the turret roof, glacis, and side
ERA. The foliage is merged lit geometry, not a paint alias, and the armor
grammar stays visible beneath it. Mandatory-kit P95 = 3.1009 m; heightM
2.44 -> 3.10. FALSE-0 law holds: no oracle registration, gate file, or ledger
row was invented; the datum replica repeated exactly with dims sanity 100.
Independent proc-only 14-view identity PASS, floor 9.0 / mean 9.20. Binding
**329ec520 -> d6e87b0c** (51 meshes / 204812 verts). Full verdict:
the archived visual-review receipt.

## FULL ARMOR/GHILLIE BINDING (2026-08-10, §5.107)
SEPv3 receives the densest full turret/hull/CROWS foliage package while its
fine cassette, Trophy and wide-low identity remain legible. P95 height is now
3.18 m. FALSE-0 still holds: no gate row was invented. Corrected yaw ownership
PASS; independent §B8 floor 9.3 / mean 9.44. Binding **d6e87b0c -> 2cd6070**
(55 meshes / 237010 verts). Full verdict:
the archived visual-review receipt.
