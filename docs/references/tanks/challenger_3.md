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
