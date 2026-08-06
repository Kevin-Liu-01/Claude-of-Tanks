# Type 99A / ZTZ-99A (`type99a`) — BASE-21 photo-class packet

**Exact variant to model:** Type 99A, PLA production fit — t72-lineage
low hull carrying a WELDED angular turret with big wedge appliqué cheeks
meeting the distinctive arrow-shaped front seam, FY-4 ERA arrays on
glacis + skirt front half + cheek faces, 125 mm ZPT-98 with the
Russian-style mantlet boot (§B3.1), JD-3 laser dazzler + panoramic sight
roof cluster, QJC88 12.7 mm (NSVT-class silhouette — §H.4 national
grammar: Chinese kit reads Soviet-family), unditching log + twin fuel
drums rear (russia kit grammar), 6 big dished roadwheels + skirts, PLA
woodland digital splinter, '215' side numbers.

## OWNERSHIP / ROUND STATE (2026-08-06, slice-3 → handover)
**BUILDER NOT YET AUTHORED.** The slice-3 agent was re-scoped mid-round
(spend-limit death + deconfliction); the k2 finish and this build were
absorbed by the AFV/modern3 lane. This packet is the **build-ready
design spec** — every station below was computed against the current
spec/pivots this round; the ancient builder still stands at
`src/vehicles/modern2.js buildType99A` (:898, its roster profile home —
lane resolution between modern2.js ownership and the absorbing agent is
the orchestrator's call). Baseline battery for the ancient build was
measured this round (see §Battery).

## ORACLE STATE
**NO reference oracle.** MODEL_SOURCE procedural, no ledger row,
tmp-tank-critic refuses the id. **FALSE-0 LAW: never gate this id.**
Bar = photo class + published dims + §B battery + 14-view self-reads
(tools/tmp-ww2-photoclass rig, id-generic — `--id=type99a` proven this
round: before-shots at shots/base21-modern-s3/type99a-before).

## Corroborated dimensions (photo-class targets)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.6 m | Wikipedia Type 99, army-technology |
| Overall length (gun fwd) | 11.0 m | Wikipedia (10.92-11.0 quoted), sinodefence archives |
| Width | 3.5 m (spec; 3.7 with appliqué quoted some sources) | Wikipedia, tanks-encyclopedia |
| Height | 2.35 m (spec crest line; ~2.5 to pano quoted) | Wikipedia, army-guide |
| Gun | 125 mm ZPT-98, thermal sleeve, mid-tube evacuator, boot at root | Wikipedia, NORINCO materials |
| Running gear | 6 large dished wheels, rear drive, front idler | photos, Wikipedia |

Spec dims (modern2.js) 7.6 / 11.0 / 3.5 / 2.35 — **dims sovereign; build
to the spec** (t14 width-note precedent: flag the 3.5-vs-3.7 divergence
for an owner ruling, never true the spec unilaterally). Spec
`turretPivot [0,1.42,0.1]` / `gunPivot [0,0.34,0.55]` RETAINED —
trunnion world (0, 1.76, 0.65). SPEC NOTE (residual): armor
`gunBarrel.lengthM` 6.25 vs the designed 6.55 visible run — shadow-proxy
true-up, orchestrator lane.

## Family-inspo mapping (owner guidance)
Donor = the **russia/t72 lineage** (owner: "type99a <- the russia-style
lineage"): low hull proportions, center driver, 0.03-lane-law skirt
arithmetic, the rear kit grammar (unditching log + fuel drums), the
125 mm boot (§B3.1 "Russian 125mm carries its distinctive mantlet
boot"), NSVT-class MG silhouette. What is DELIBERATELY NOT russian
(§H.4 distance from t72b3m/t90a): the turret is a WELDED ANGULAR BOX
with flat wedge appliqué cheeks meeting an arrow seam — never a cast
dome; the skirt front half is a clean 3×7 FY-4 tile WALL (not soft-bag
jumble); JD-3 dazzler drum + pano cluster on the roof; 6 BIG dished
wheels (t72 carries 6 smaller + distinct hub read); digital splinter
camo. vs t14: manned turret with hatches/sights (no shroud), drums/log.

## r1 DESIGN SPEC (build-ready; all coordinates world-frame at scale
## 1.0 unless marked turret-local)

Old build (ancient, measured this round): clip 119/44 band + 97/44 shoe,
census mg0+0d (hand-rolled `pintle()` helper), skirts/tiles authored to
±1.90-1.93 vs the 3.5 published width (§D violation — everything
rescales), muzzle +6.90 = 10.70 overall vs 11.0.

### Frame (the §D anchors — nothing may exceed them)
- Width anchor **±1.75 EXACT** = skirt ERA tile faces + front-panel
  faces. Hull z **±3.80**. Muzzle **+7.20** = 11.0 overall over the
  −3.80 tail. Roof world 2.14; published 2.35 = the crest line (pano
  head over it documented as a real-fitting spike, t14 precedent).
- Track: xc 1.37, trackW 0.58 → outer face 1.66 = 0.03 clear of the
  1.69 skirt inner plane (§B4 lane law); inner face 1.08.

### GEAR (§B6 trapezoid)
`buildRunningGear`: style rubber, wheelR 0.37, wheelW 0.22, wheelY 0.47,
xc 1.37, dishR 0.78 (big stamped-dish read), wheelZs [2.50, 1.50, 0.50,
−0.50, −1.50, −2.50], sprocket {−3.22, 0.53, 0.32} (orbit far −3.715 /
top 1.025), idler {3.24, 0.50, 0.30} (far +3.715 / top 0.975 = the
crest), rollers [1.55, 0, −1.55] y 0.90 r 0.08, trackW 0.58, topY 0.90,
arms true (visible below skirts), paintedEnds true, coveredTop true.

### HULL
- Belly box(2.10, 0.60, 7.55) c (0, 0.70, 0) → ±1.05, y 0.40..1.00.
- Deck band frustum(1.60, 2.10, −3.78, 1.56, 2.05, −3.74, 1.00, 1.42)
  (t72-low roof 1.42 = the turret ring base).
- Fenders(P, 1.05, 1.74, 1.02, −3.74, 3.60, 0.03).
- **Glacis (§B1 ONE plane, 19°, in CO-PLANAR pieces per the t14
  FRUSTUM-UNDERSIDE law)** — plane: y(z) = 1.42 − 0.3448·(z − 2.05):
  - center prow ±1.05 runs the FULL line: slab bot [±1.05, 0.82, 3.79]
    → underside ring [±1.05, 0.78, 3.67]; top [±1.05, 1.42, 2.05] /
    [±1.05, 1.42, 1.87].
  - full-width piece ±1.60 STARTS AT THE TOE z 3.02 ON THE SAME PLANE:
    bot [±1.60, 1.086, 3.02] / [±1.60, 1.046, 2.90]; top [±1.60, 1.42,
    2.05] / [±1.60, 1.42, 1.87]. **Binding math (do not move the toe
    forward): underside(z) = 1.38 − 0.3448(z−2.05) vs wrap crest 0.975
    @ z 3.24 — a full-width underside crossing the idler zone clips at
    the crest for ANY toe forward of ~z 3.1; 3.02 clears by ≥0.19.**
  - lower bow center lane ±1.05: slab from (0.40, 3.55) up to the toe
    line (0.82@3.79 / 0.78@3.67) — co-planar with the prow underside.
- Front mudguards box(0.64, 0.03, 0.44) c (±1.39, 1.02, 3.50) —
  underside 1.005 over the 0.975 crest (0.03 clear) + front flaps
  box(0.56, 0.30, 0.026) c (±1.40, 0.86, 3.755) → inner 3.742 = 0.027
  clear of the +3.715 orbit, outer 3.768 inside ±3.80.
- Rear: plate face −3.76 (center lane ±1.03 below the band, full width
  above), exhaust grilles + louvres, taillights, convoy light; rear
  flaps c −3.755 (0.027 clear of −3.715); **LEFT hull exhaust port**
  (t72 signature): hullDark box(0.45, 0.28, 0.06) at (−1.63, 0.95,
  −2.30) proud of the band + soot decal below it.
- Splash V + driver CENTER hatch box/strip at the crest (0, 1.435,
  2.15) + 2 periscopes; deck panel seams; engine deck grille field
  (dark inset + 5-6 slats) rear + intake hump box(0.9, 0.08, 0.8) at
  (−0.45, 1.46, −1.55); fender stowage boxes box(0.30, 0.16, 1.10) at
  (±1.45, 1.10, 1.20) and (±1.45, 1.10, −0.60) + lid seams; sponson
  hullShadow strips box(0.52, 0.026, 7.0) at (±1.38, 1.00, −0.05).
- KIT (russia grammar, §I census — expected mg1+4d):
  - FITTINGS.unditchingLog len 2.2 r 0.10 at (0, 1.30, −3.68) (z extent
    −3.58..−3.78 inside the envelope).
  - **FUEL DRUMS ×2** (hand-authored, russia read): hullDark
    cylZ(0.28, 0.80, 14) at (±0.88, 1.35, −3.35), rx 0.22 (nose-up
    tilt; rear ends ≈ −3.73 inside ±3.80) + 2 bracket boxes each +
    end-rib tori. Drums are HULL furniture (§B5: they never yaw).
  - FITTINGS.towCable r 0.020 over the glacis ERA: pts [[1.28, 1.05,
    3.22], [0.40, 1.30, 2.50], [−0.60, 1.20, 2.80]] (+0.03..0.04 proud
    of the plane).
  - 2× FITTINGS.lightCluster (±1.42, 1.06, 3.55) rake −0.30.
  - Lift eyes ×4, '215' hull option, soot at the left exhaust.

### SKIRTS (±1.75 EXACT — the §D guard)
- Panels centered ±1.715 (faces 1.69/1.74).
- FRONT HALF: 3 thick panels box(0.05, 0.56, 1.05) at z 2.90 / 1.80 /
  0.70 (y 0.58..1.14) + chamfered lower lips + deep dark seams.
- **FY-4 TILE WALL** via eraCluster('skirt_era_R'/'_L'): put(±1.715, y,
  z, 0, ±π/2, 0) — tile (0.28×0.13×0.07) rotated ry ±π/2 → **faces
  ±1.75 EXACT**; 3 rows y 0.66/0.89/1.12 × 7 cols z 3.30 − c·0.47.
- REAR HALF: rubber skirt box(0.035, 0.42, 3.40) c (±1.705, 0.82,
  −1.95) + 5 dark vertical seams + lower fringe.
- **Armor ERA def true-ups REQUIRED in the same edit (era-kind plates
  only, no core armor)**: `skirt_era_R/L` sR/sL(…, 15, **1.76, 0.55,
  1.76, 1.15, 0.3, 3.45**) — the current 1.86 def sits OUTSIDE the new
  1.75 anchor and would float in the armor inspector; `glacis_era_L/R`
  fr(…, 15, **0.8, 0.95, 3.46, 1.42, 2.10**) to sit on the new plane.

### GLACIS ERA (FY-4 chevron field)
- Dark mounting bed slab on the plane first (t14 r5 lesson: inter-tile
  gaps read as recessed seams, not camo-on-camo): hullDark box(1.50,
  0.60, 0.025) at (±0.80, ~1.19, on-plane z, rx −71°).
- eraCluster('glacis_era_R'/'_L'): 4 rows × 5 cols per side,
  zOf(y) = 2.05 + (1.42 − y)·2.90 + 0.05; y rows 0.95 + r·0.12; x =
  ±(0.17 + c·0.33) (max 1.49 inside ±1.60); rx −71·D2R.

### TURRET (welded angular + wedge appliqué; pivot y 1.42 z 0.10;
### coordinates TURRET-LOCAL)
- CORE: keep the proven 12-pt welded polyTurret plan [[0.40,0.95],
  [0.92,0.62],[1.10,0.16],[1.10,−0.42],[0.80,−0.88],[0.42,−1.10],
  [−0.42,−1.10],[−0.80,−0.88],[−1.10,−0.42],[−1.10,0.16],[−0.92,0.62],
  [−0.40,0.95]], h 0.72, flare 1.04, inset 0.92, offset z −0.15. Roof
  local 0.72 = world 2.14.
- **WEDGE APPLIQUÉ CHEEKS — author EXACTLY on the existing armor
  chR/chL plate lines (defs UNCHANGED: xIn 0.24, zIn 1.05 → xOut 1.20,
  zOut 0.28, y 0.05..0.62, tb 0.08)**:
  R slab bot [0.24, 0.02, 1.05], [1.20, 0.02, 0.28], [1.20, 0.02,
  0.04], [0.24, 0.02, 0.81]; top [0.24, 0.62, 0.97], [1.20, 0.62,
  0.20], [1.20, 0.62, −0.04], [0.24, 0.62, 0.73]. L = corner-swapped
  mirror (§C winding law). Face lean ≈7.6° back (near-vertical — the
  99A read). **Front-face planarity is exact by construction** (uniform
  0.08 top pullback: AD·n = 0 — same twisted-quad discipline as k2).
- **ARROW SEAM**: center prism pair ABOVE the gun slot only (y
  0.38..0.62), converging to the ridge: R half bot [0, 0.38, 1.13],
  [0.24, 0.38, 1.05], [0.24, 0.38, 0.81], [0, 0.38, 0.89]; top [0,
  0.62, 1.05], [0.24, 0.62, 0.97], [0.24, 0.62, 0.73], [0, 0.62,
  0.81]; L corner-swapped. Below y 0.38 = the slot: dark recess wall
  box(0.46, 0.36, 0.06) c (0, 0.20, 0.84); the boot straddles (gun
  axis local y 0.34). Thin dark ridge seam strip down the arrow.
- **CHEEK ERA** via eraCluster('turret_era_R'/'_L', …, turretLocal
  true): 2 rows × 6 cols ON the face — parametrize P(u,v): x = 0.24 +
  0.96u, y = 0.02 + 0.60v, z = 1.05 − 0.77u − 0.08v; centers +0.045
  along n̂ = (0.622, 0.103, 0.776); u = 0.08 + c·0.165, v = 0.25 /
  0.72; put(x, y, z, −0.10, ±0.68, 0).
- Side appliqué module per side box(0.10, 0.40, 0.85) at (±1.12, 0.28,
  −0.15) + dark seams (subtle — the 99A side arrays are low-relief).
- ROOF CLUSTER: pano sight RIGHT-REAR — pedestal cylY(0.06, 0.075,
  0.22) at (0.44, 0.83, −0.72) + dark head drum cylY(0.115, 0.115,
  0.20) at (0.44, 0.98, −0.72) + fwd glass window + cap (head top
  local 1.08 = world 2.50 — the documented spike over the 2.35 line);
  **JD-3 LASER DAZZLER LEFT** — drum cylY(0.10, 0.11, 0.15) at (−0.50,
  0.795, −0.62) + dark window box facing +z (the distinctive pair);
  gunner sight doors LEFT-FRONT box(0.42, 0.10, 0.38) c (−0.42, 0.77,
  0.28) + dark aperture + glass slit + door split seam; commander
  hatch ring (0.44, 0.735, −0.30) cylY(0.23) + torus; gunner hatch
  (−0.44, 0.73, −0.20) cylY(0.20); meteo mast base + cylY(0.02, 0.026,
  0.50) at (0, ~0.99, −1.15), top ≈2.64 world (documented spike).
- **QJC88 12.7**: FITTINGS.pintleMG cls 'nsvt', tone 'dark', scale
  0.95, ammo true, at (0.58, 0.745, −0.42), rotation [0, 0.4, 0] —
  the §B3 census mg1 + the §H.4 Soviet-family silhouette.
- Smoke 2×5: smokeCluster(P, ±1.05, 0.38, 0.28, 5, ±0.95, 0.6) on the
  forward side walls.
- Bustle: basket rails z −1.42..−1.62 wrapping the rear + 9-11 posts +
  stowage duffels ×3 + tarpRoll; FITTINGS.spareTrackLinks (3-4 links)
  on the bustle floor left; 1 dark ammo can right; FITTINGS.antennaWhip
  h 0.55 at (0.85, 0.73, −0.95).
- Decals: '215' both side walls (±~1.13 at the wall plane +5 mm, z
  −0.45, rotY ±π/2).
- P.topY ≈ 1.10.

### GUN (§B3.1 — the Russian-style boot, NO prisms)
- Boot at the root (gunMount, gun-local z): stacked tapered collars
  cylZ(0.155, 0.28, seg, 0.185) at 0.42 + cylZ(0.145, 0.26, seg,
  0.165) at 0.66, dark cinch rings cylZ(0.16, 0.04) at 0.55 and 0.79,
  root drum cylZ(0.19, 0.14) at 0.30 (round carrier — never a box).
- `buildGun({ len: 6.55, r: 0.068, sleeve: true, evac: 0.52,
  baseR: 0.15, evacR: 1.75 })` → **muzzle +7.20 world = 11.0 overall
  EXACT**; fat evacuator drum mid-tube (the 125 read), sleeve + clamp
  rings, no MRS collar.

### Machine battery — BEFORE (measured 2026-08-06, official rigs);
### AFTER = the builder's done-gates
- track-clip --exact BEFORE: **119/44 band + 97/44 shoe** (worst hits
  front rig_hull — the old ±1.86 skirt vs 1.84 track outer, and the
  glacis underside class). AFTER target: 0/0 + 0/0.
- tank-standard-check BEFORE: clip ✗(119), contig 0 ✓, **mg0+0d ✗**.
  AFTER target: clip ✓, contig 0, mg1+4d+.
- turret-parent BEFORE: 0/0/0 — hold it (drums/log = hull; basket/
  whip/mg = turret).
- §B5 yaw-90 pair + npm test + 14 self-reads (floor 8.5+) + packet
  round section = the §F.3 round close.
- Shots: shots/base21-modern-s3/type99a-before (ancient build, 14
  views) for the before/after strip.
- Resident invariance: modern2.js residents t14 + leo1a5 hashed this
  round (fd8126f4 / 3adc2bdc at MY tree — live-tree drift applies;
  re-pair at the builder's tree).

### 14-view SELF-READ EXPECTATIONS (targets, NOT verdicts)
Floor 8.5+ per slice precedents. Expected weakest reads to iterate
first: front (arrow seam legibility over the boot; the seam must read
as TWO planes meeting, not a flat face), close-roof (dazzler/pano pair
identifiability at 1×, §B3 mystery-box risk on the sight doors), left
(drum/log/basket density vs the clean tile wall), top (welded plan +
wedge tops — no §B2 pocket between cheek tops at y 0.62 and the
polyTurret walls: verify the 0.62→0.72 step seats against the core
face, add a thin filler course if a top-down sliver opens).

### Acid views (§H.4 tells to name)
Arrow-seam wedge front + FY-4 tile wall skirts + JD-3 drum + pano pair
+ NSVT-class MG + drums/log rear + 6 big dished wheels + digital
splinter. Confusable-with-t72b3m/t90a = fail (welded arrow vs cast
dome is the headline tell); confusable-with-t14 = fail (manned roof
cluster + hatches vs shroud).

### Residuals / owner-ruling flags
- Spec width 3.5 vs sources quoting 3.7 over appliqué — build follows
  the spec (dims sovereign); flagged for an owner ruling (t14
  precedent).
- Spec gunBarrel.lengthM 6.25 → 6.55 proxy true-up (orchestrator lane).
- p95 spikes over 2.35: pano 2.50, mast 2.64 — real fittings,
  documented (fold-down only if an oracle lands).
- NO ORACLE: §E re-source lane open for a clean-license ZTZ-99A print.
- reverseSpeedKmh 12 (spec) — the real 99A's hydromechanical drive
  reverses faster; gameplay call, not mine.

### Law notes for the bank (from the slice-3 round; k2.md carries the
### shared set — repeated headline here for the rulebook fold-in)
1. **FITTINGS-IMPORT-ONLY**: in extension modules (modern2/modern3),
   fittings come ONLY from the top-level `import { FITTINGS } from
   './profiles/kit.js'`, dereferenced inside builder bodies. No
   `kitFittings()` exists (a slice-3 first cut invented one and threw);
   `KIT.fittings` attaches via queueMicrotask AFTER init and can be
   undefined in synchronous rigs. Smoke-load via tankFactory.js — an
   extension module as import ENTRY throws the kit.js TDZ spuriously.
2. **ERA-DEF/GEOMETRY COUPLING**: rebuilding ERA-carrying geometry to a
   new §D width anchor REQUIRES the era-kind armor plate defs to move
   in the SAME edit (this spec: skirt_era 1.86→1.76, glacis_era to the
   new plane) — a plate def outside the visual anchor floats in the
   armor inspector and mis-zones strip-on-hit. Era-kind defs are
   builder-lane; core armor stays orchestrator-lane.
3. **FULL-WIDTH-TOE BINDING MATH** (§B4 corollary quantified): for a
   glacis plane of slope m ending at deck (y_d, z_d) over an idler with
   wrap-crest y_c at z_c, the full-width piece's toe must satisfy
   y_d − m(z_toe − z_d) − t ≥ y_c + 0.025 **at z_c and every z the
   piece spans** — solve at the CREST, not at the toe (the t14 law's
   arithmetic form; 99A numbers: toe z ≤ ~3.1, chosen 3.02).
