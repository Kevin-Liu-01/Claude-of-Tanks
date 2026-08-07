# Challenger 3 (`challenger_3` candidate) — report-only oracle packet

NEW-VEHICLE CANDIDATE (no TANK_SPECS row, no build, no tech-tree slot).
**License gate: CC-BY-NC-4.0** — local measurement/influence ONLY,
never ships as an asset, and NC quarantine rules apply to any icons or
derivative renders if a build ever lands (strip-nc precedent).

## Asset (2026-08-06 base-21 wave)
"Challenger 3" by 42manako (verified catalog author), 6.9 MB —
`community/challenger_3.glb`. ORIGINAL authored FBX with a full
semantic hierarchy: `hull` (skirts, bowobjects, guard, frontlights,
toolbox, fireexting, fueltank2, back-lens, wheels x16, track/track2) +
`turret` (smoke a-j pods, `trophy` = Trophy APS panels both cheeks,
RCWS `stand`/`mount2`/`weapon2` cluster reusing their Boxer 30 mm RWS
kit, `turret_interior`, antennas x3, periscopes, `sensorfront`/
`sensorback`, hatches, and the main gun under `mount` -> `weapon`
(+`weapon3` coax)). 21,148 verts / 15,355 tris — low-poly-clean, ideal
grammar reference.

## Extract (docs/references/vertex/challenger_3.json — vertex REG entry `challenger_3`, NOT in any harness map)
Registration: turretNode `^turret$`, gunNode `^weapon$`, autoPivot,
yawOffset -PI/2 (raw nose +x, the leclerc convention — first run
confirmed z-box was the width). ANCHOR CAVEAT: scaled against the
CR2 spec dims (8.33 / 11.50 / 3.52 / 2.49) because no CR3 spec exists;
percentages below are vs that anchor, the raw proportions are the
deliverable.
- width 3.519 (0% — the anchor axis), hull mask 7.964 (-4.4%), overall
  10.335 (-10.1%: the print's L55A1 run is short vs the CR2 11.50
  anchor), body height 2.982 (+19.8% vs 2.49 — the print reads tall:
  RCWS + sensor masts carry the p95, plus a proud turret).
- Proportion set (anchor-free): body h / hull-mask len = 0.374; width /
  hull-mask len = 0.442; overall / hull-mask = 1.298.
- Orientation assert: AGREES after the yaw fix (glacis +z, gun +z).

## If the owner greenlights the build
Spec row first (66 t, 1,500 hp CV12 upgrade path, 120 mm L55A1 smoothbore
— NEW ammo family vs CR2's rifled L30, Trophy APS, EPSOM/Thales sights);
profile home = modern1 next to challenger2 or the future uk.js family
file; the build is PHOTO-CLASS with this print as NC-quarantined
influence + measurement oracle (it may instrument a LOCAL gate the same
way recovered NC prints do — registration would go into the three
harness maps at that point, not before).

## BUILT r1 (2026-08-06, oracle-backed moderns round — owner greenlight
## executed; §B8 PROPORTIONS FIRST governs)
NEW VEHICLE landed in `src/vehicles/modern1.js`: armorChallenger3() +
MODERN1_SPECS.challenger_3 + buildChallenger3 (+MODERN1_BUILDERS row).
Dims row = the CR2 anchor (8.33 / 11.50 / 3.52 / 2.49 — packet caveat
above stands; dims sovereign). Registration landed in ALL THREE harness
maps (fidelity LOCAL_REFERENCE_OVERRIDES + tmp-tank-critic + evaluator
CRITIC_REFERENCE_OVERRIDES), mirroring the vertex REG row: turretNode
`^turret$`, gunNode `^weapon$` (anchored — skips the RWS `weapon2` +
coax `weapon3`), autoPivot, yawOffset -PI/2. LOAD-PROVEN: the first
official gate run measured (no timeout, no false-0) before any row was
recorded (FALSE-0 law held).

### Build inventory (§B8 print form at published envelope)
- GEAR: 6 wheels r 0.36 at the print's ground run (z 2.55..-2.00, pitch
  0.89; track x 0.98..1.60), HIGH-TUCKED idler {3.32,0.88,0.30} +
  sprocket {-2.78,0.94,0.33} (§B6 trapezoid), contact pins 2.75/-2.15.
- HULL: belly ±0.86 @ 0.42 + sponson strips (print front rows), 3-piece
  wrap-safe band (spine ±1.06 / sponson floors 1.475 / outer walls
  ±1.68), stepped engine deck (1.64/1.67/1.74-hump/1.69) falling to the
  1.28 tail (print line), §B1 one-plane glacis (1.05@4.13 -> 1.55@2.32)
  + 0.85 bow lip + raked lower bow, boat-tail underside, low exhaust
  cowls, front corner flaps (dims body-band pin).
- SKIRTS ±1.755 EXACT (§D anchor): raised stepped front panel + 3 bays
  ONLY (the print's skirts end ~z -0.9; rear run OPEN — §B8 wheel
  exposure), scallop tabs at 0.585, bottoms 0.62 (hub line).
- TURRET (print form): walls ±1.41 spanning z_w 1.08..-1.89, rear face
  -2.13 across ±1.23 + corner chamfer strakes, raked one-plane face
  (§B1.1 both cheeks) over jutting lower cheek wedges to 2.62w, roof
  2.40w, bustle underside floating at 1.67w (print tail bottoms),
  TROPHY APS modules both flanks (vent lines + fore/aft radar faces),
  PROTECTOR-class RWS front-left (M2 12.7 per §H.4 UK grammar — the
  print carries the author's Boxer 30 mm kit there; certified residual),
  EPSOM gunner hood sunk into the face, pano rear-right, 2x5 smoke,
  full-width bustle basket + stowage, 3 whips (0.44-0.48 — authored to
  the sensor-inclusive datum).
- GUN: 120 mm L55A1 SMOOTHBORE — bore line 1.76w (print), evacuator at
  0.50, thermal sleeve, MRS collar, §B3.1 muzzle bore (shadow-named
  kit.js mechanism), muzzle +7.335 = 11.50 EXACT.

### HONEST GATE BASELINE (first challenger_3 ledger rows ever; FINAL
### tree x4 bit-identical across two x2 batteries)
FINAL: **hull 42.4 / whole 41.6 / turret 54.5 / stations 52.4 / dims 0 /
floaters 100** (raw first-build state read 37.2/29.3/48.6/37.1 before
the worldtrace fix loop; the §B4 wrap-lane law pass briefly cost whole
41.4 -> 30.1 with over-lowered end drums before the print-true re-tune
recovered 41.6 — clip law outranks rows). dims decode: hullLengthM
-0.94% / overall -0.40% / width +0.22% all in grace; heightM actual
~3.12 vs the 2.49 CR2-anchor datum = the DIMS-DATUM CLASS (the print
itself reads bodyHeightM 2.982 = +19.8%): FILED — heightM 2.49 -> ~2.95
(sensor-inclusive datum; RWS/pano/whips carry the p95 on BOTH models).
Round-close battery (final tree): track-clip --exact front 0/0, rear
34 band + 4 shoe ALL on the "(unnamed)" full-width y-1.04 sliver = the
hullShadow AO strip that rides the shoe envelope by design (§B4
dressing class, within the <=60 bar; rig_hull itself reads 0);
turret-parent 0/0/0 (BORN-CLEAN §B5); winding-audit mode-2 CLEAN (0
yaw-stranded candidates), mode-1 **2 latent reversed pieces at 0 px
render deficit** (LATENT REVERSED-CORE class, not render-visible — the
born-clean census-0 bar is MISSED by 2: standing next-round order to
census + re-order them); standard-check contig 0, census mg1+6d;
§B8 pairs shots/critic-challenger_3/ at the final tree (walls lean to
the roof per the print; honest reads: wheels render DARK vs the print's
pale rims — same §C tone class flagged on challenger2 — and the print's
elevated Boxer 30 mm barrel column is deliberately unmatched per §H.4).
Known certified residuals: the print's 5.2-m antenna spike owns its st4
station top (trim absorbs it); the print's elevated Boxer 30 mm barrel
(z_w 1.4..2.75 at ~2.9) vs the UK-grammar M2 (§H.4) costs side_whole/
turret cols + st11 top; print stylization: hull -4.4% / overall -10.1%
(short L55A1 run: cover-cap class like the t14 tube) / body +19.8%.
Fix-loop law notes: a 6th skirt bay overshot the stern to z -4.405 and
cost hullLengthM +3% AND overall +2% before the worldtrace caught it
(§D: one furniture strip re-anchored two dims); the floating soot decal
(§C decals-are-mask-geometry) read as a phantom 2.31-top front column
until pinned on the rear plate.

### ATTRIBUTION note DRAFT (for the orchestrator to land in
### docs/ATTRIBUTION.md — NC quarantine wording)
> **Challenger 3** by 42manako — sketchfab, **CC-BY-NC-4.0** (verified
> live 2026-08-06, base-21 wave). LOCAL-ONLY QUARANTINE class (NC): the
> GLB (`public/models/tanks/community/challenger_3.glb`, 6.9 MB) is a
> measurement/influence oracle for the procedural `challenger_3` build
> and NEVER ships as a runtime asset; MODEL_SOURCE stays procedural; no
> derivative renders/icons of the print itself distribute (strip-nc
> precedent). Registered (measurement-only) in the three harness
> override maps + the vertex-extract REG 2026-08-06 at the owner's
> challenger_3 greenlight. Extract: docs/references/vertex/
> challenger_3.json.

## FINISH r2 (2026-08-06/07 punch list 3 — owner order "finish the
## challenger 3"; challenger lane, DELIVERED-PENDING-CRITIC per §B8)
Baseline (post c48bf50 datums, x2): hull 42.4 / whole 41.6 / turret 54.5 /
stations 52.4 / dims 66 / floaters 100 — min 41.6.
**FINAL (x2 bit-identical): hull 67.4 / whole 61.4 / turret 71.1 /
stations 77.9 / dims 99.8 / floaters 100 — min 61.4.** Every component
+15 or better (+25.0 / +19.8 / +16.6 / +25.5 / +33.8).

### What moved (all in buildChallenger3 / modern1.js; authored from
### tmp-moderns-worldtrace ABSOLUTE world columns, 3 trace rounds)
1. **dims 66 -> 99.8:** the p95 carrier was the RWS M2 fitting topping
   3.13w (whatsat AABB census; the sensor datum is 2.95). RWS re-derived
   onto the print's own RCWS plateau (side ref 2.96-3.00 tops at z_w
   0.55..1.15): mount body top 2.85, sensor head 2.96, M2 seat C3H+0.22
   (receiver ~2.93-2.97), level-ish barrel to z_w ~1.9. p95 now rides the
   plateau at 2.95 (0.07-0.16% err across runs).
2. **Stern floor (side_hull +25):** belly ends -3.15, steep boat-tail
   rise 0.42@-3.15 -> 0.97@-3.38, rising underside wedge 0.97 -> 1.19@
   -4.05 (ref line 0.97..1.19), upper plate raised to 0.98..1.38.
3. **Stern plan (plan rows +21..+25):** upper rear plate SPLIT — outer
   anchor posts x 0.75..1.28 keep the face -4.125 (the hullLengthM/dAlong
   BODY column; REGISTRATION-ANCHOR law held: dAlong -0.065 all round),
   center plate recessed to -3.96 (print center-rear line) carrying
   grille/louvres/convoy/soot; stern deck slab tapers to ±1.30 ending at
   the -3.94 plate line; tapered stern walls 1.63@-3.55 -> 1.28@-3.92.
4. **PLAN-GRID LAW (new, banked):** plan-view trace columns pitch 0.13 m
   (SQUARE camera over the z-span), not the 0.04 width-pitch — the ±1.72
   column window spans 1.655..1.785. The print keeps its band walls
   inside 1.63 there (only skirts reach further): outer band walls pulled
   1.66 -> 1.61 (faces 1.59..1.63), sponson floors end x 1.63. This also
   fixed the FRONT ±1.61 columns (walls now own them at bot 1.02 vs the
   old track-band AA reads).
5. **Turret tail step (T rows +16.6/+27.3 -> plan 81.8):** the print's
   tail zone tops at 0.70-0.74 local (side ref 2.25-2.29w at z_w
   -1.72..-1.98) — main C3H body ends -2.87 local, tail steps DOWN to a
   0.72 roof; chamfer strakes re-derived from the print's plan chamfer
   line (x 1.23@-2.13w -> 1.50@-1.86w); bustle rack compacted to the
   tail face (rails z_w -2.135; the old -3.62 rails were 3 only-proc
   cover columns); in-basket stowage deleted (print-clean tail).
6. **Trophy APS re-derived:** faces out to x 1.74 hanging at the roof
   line (plan ref [0.95,-1.70]w at |x| 1.6; front ref tops 2.44-2.46 at
   |x| 1.62-1.74), z_w -1.685..0.935, vent lines + fore/aft radars.
7. **Whips = the print's antenna columns:** its 5.19-5.21w spike lights
   ONE side column (z_w -1.46) and TWO front columns each side (x 0.91 +
   0.97) — a1 h 1.75 @ (-0.90, -1.42w), a2 h 1.60 @ (0.92, -1.47w), a3
   h 1.45 @ (0.965, -1.40w), rake 0 (antennaWhip rake is an X-LEAN —
   banked: a raked whip sweeps 2-3 front columns). All three share the
   side column under the ref spike; side p95 stays on the RWS plateau
   (2 cols above the 2.95 datum, <=4 budget, ref-spike aligned).
8. **§B3.1 MANTLET + fat sleeve:** flat-faced armored mantlet block
   (0.56 x 0.44, face z_w 2.51, pitches with the gun) + chin shadow seam
   + boot collar ahead; FAT root thermal sleeve r 0.185 z_w 2.60..3.55
   (print plan gun columns) + clamp/step rings. Muzzle bore unchanged
   (shadow-named kit.js mechanism).
9. **§B8.1 native-tone wheels:** tireHex '#565c50' (merkava r12
   mechanism) — the acceptance-flagged "wheels render DARK vs the
   print's pale Hydrogas rims" §C tone item.
10. **Gear:** sprocket re-seated z -2.66 / y 0.92 (wrap far -3.145
   clears the -3.26 stern column whose ref floor is 1.13; orbit top
   1.405 = sponson floor 1.475 - 0.07). Track-clip re-verified (below).

### Certified residuals / caps (documented, not chased)
- SHORT-GUN COVER CAP: 7 only-proc muzzle columns z 6.53..7.30 (print
  overall -10.1%) = side_whole cover 5.26% (~-7.9 pts) + plan_whole
  center columns. §E tube-pin normalize FILED for the orchestrator
  (same class as the t14 plan): z-warp knee at the print's gun bearing,
  scale to +7.335-frame parity; until it lands these columns are the
  certified cap (hull-anchored registration caps wholeCurves + the
  turret-row tube columns only).
- -4.17 only-proc column = the hullLengthM anchor (print hull -4.4%
  short; dims sovereign).
- §H.4 residual (re-certified): the print's elevated Boxer 30 mm barrel
  columns (ref 2.87w tops at z_w 2.0..2.67, ~5 cols x ~0.35) — the UK
  M2 cannot reach them; grammar law outranks the rows.
- Print's twin 5.21w antennas: front columns ±0.91/±0.97 read my 3.9-4.3
  whip tops vs 5.21 (~0.5 x 4 cols) — real whips at real height; the
  print's 2.2 m antennas are its own fit.
- AA-TEETER: the ±1.62 front columns sit on the ch3 shoe envelope edge
  (x 1.592 = window boundary) — coin-flip reads, not orders.
- st4 station (print antenna spike) 17.5 + st11 (print RCWS/barrel zone)
  11.4 topPct — both inside the 2-worst trim.

### Round-close battery (final tree; details in the round report)
track-clip --exact / turret-parent / winding-audit both modes /
standard-check / hashgeo x2 — run at round close (see report). §B8
REF|PROC pairs re-rendered at the final tree: shots/critic-challenger_3/.
Self-reads never accept (§B8): DELIVERED-PENDING-CRITIC.

### FINAL GATE LINE (x2 bit-identical, FINISH r2 tree)
hull 67.4 / whole 61.4 / turret 71.1 / stations 77.9 / dims 99.8 /
floaters 100 — min 61.4. tmp-hashgeo x2: **17bb2528** (54 meshes /
56401 verts) — record hash, NOT a freeze (no dual gate). Round-close:
track-clip --exact 0/0 + 0/0; turret-parent 0/0/0; winding-audit
mode-1 rev 0 deficit 0 (the r1 standing '2 latent reversed' CLOSED:
the stern deck slab ring order + the lower-bow frustum, both
re-authored in the glacis slab convention), mode-2 clean; standard-
check contig 0 census mg1+6d; npm test 166 + track-geometry PASS.
