# Merkava IVm Windbreaker (`merkava4`) — reference packet

Exact variant: Merkava Mk.4M "Windbreaker", IDF, 2010s fit — MG253 120 mm L/44
smoothbore, Trophy APS slabs on the turret sides, flat-roofed wedge turret with
the angled gun-mount cheek and NO loader's hatch, rear turret basket with the
ball-and-chain curtain, front engine (hump right of the driver), 6 road wheels,
FRONT drive sprocket, rear clamshell troop door.

## Corroborated real dimensions
- Hull length 7.60 m; overall length gun-forward 9.04 m; width 3.72 m;
  height 2.66 m to turret roof. Weight ~65 t.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  http://www.army-guide.com/eng/product1602.html ,
  https://www.army-technology.com/projects/merkava4/
- Gun: MG253 120 mm smoothbore, L/44 → tube ≈ 5.3 m (IMI Systems / MKE 120mm
  L44 barrel data: 5300 mm), thermal sleeve, bore evacuator at ~28% of tube,
  visible overhang past the LONG hull nose only ≈ 1.2–1.4 m.
- Running gear: 6 road wheels per side, coil-spring bogies, FRONT drive
  sprocket, high rear idler, 5 small return rollers, deep angled slat skirts.
- Reference links (links only): https://en.wikipedia.org/wiki/Merkava ,
  https://commons.wikimedia.org/wiki/Category:Merkava_Mark_IV ,
  https://www.primeportal.net/tanks/dmitry_derevyankin/merkava_4m/

## Local GLB oracle (public/models/tanks/merkava4_arlassar.glb)
Width-normalized (scale ×0.926, "artist modeled wide" — the r7 footprint clamp
binds). ORACLE PROPORTIONS DIVERGE FROM THE REAL VEHICLE: whole span is only
z −3.47..+3.47 (6.94 m equivalent at 3.72 m width, vs 9.04 real) — the model
is visibly foreshortened, and scoring is against IT, so the procedural must
match the oracle, not the datasheet:
- Hull: nose z +2.95 (toe y 0.62..0.88), tail −3.44; deck y ≈ 1.30–1.34;
  upper glacis line (2.9, 0.88) → (1.0, 1.30); lower glacis (2.95, 0.62) →
  (2.05, 0.07); rear slope from (−2.85, 1.28) to tail bottom rising 0.6;
  engine intake hump x 0.25..0.95, z 0.7..1.85, top ≈ 2.07.
- Turret: gun-notch apex (z 1.44, y ≈ 1.6); cheek line rises to roof front
  edge (0.0, 2.13); flat roof 2.13 over z 0..−0.9 (sight bumps 2.27–2.38);
  rear roof slope to (−1.95, 2.0); bustle face ≈ −2.1; basket to −2.9 at top
  ≈ 1.96 with chain drops below; plan ±0.32 @z1.44 → ±1.55 @z−0.3 → ±1.45
  @z−2.0.
- Gun: axis y 1.60, tube tip z +3.47, r ≈ 0.065 sleeved.
- ORACLE DEFECTS: (1) model sits ~5–7° YAWED in its own frame (top-view
  footprint drifts +0.5 m right over its length) — unfixable in a straight
  procedural, costs top/quarter-view IoU; (2) the offline turret split left
  BARREL-SLEEVE fragments in the hull node out to z ≈ 3.44, so the reference
  gun-overhang mask is nearly EMPTY — the procedural barrel tip must stay
  within the common hull bounds (+3.45) or the gun score collapses to 0.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (canonical modern1 stand-in) | 60.5 | 74.4 | 76 | 37 | 0 | 81 | baseline |
| 1 (bespoke rebuild: oracle-fitted chassis + wedge turret + short-overhang gun) | 75.5 | — | 78 | 37 | 100 | 89 | full rebuild in profiles/merkava.js |
| 2 (LOD0 turret buckets, rotor, frame basket, corner bins, Trophy fit) | 78.0 | 77.7 | 80 | 51 | 100 | 87 | turret comp capped by oracle yaw + fused-barrel hull fragments |
| 3 (shaded-parity r2: gunmetal basket/chains/MG/smoke/antennas, detail-tone mantlet cheeks, Trophy slab + radar mount struts — float fix, dished wheels dishR 0.78, deck grilles/headlight guards/tow eyes/driver hump/door hinges, skirt bolts + rubber hems, front fender boards over the sprocket | 77.9 | — | 80 | 51 | 100 | 88 | material/furniture pass — silhouette pinned |

Remaining gaps (oracle defects dominate): (1) the ~5-7 degree yaw baked into the
GLB costs every quarter/top view (top 81 vs 95+ on the recovered marks);
(2) the barrel-sleeve fragments left in the oracle's hull node subtract the
barrel from ITS upper-assembly mask while the procedural barrel legitimately
stays in ours — turret IoU ceiling ~0.65 (fixing either needs an oracle
re-split in userdrops3.js, outside this family's file ownership).
