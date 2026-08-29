# Type 99A / ZTZ-99A (`type99a`) — BASE-21 photo-class packet

> **CURRENT AUTHORITY (2026-08-12):** the `6d52abda` first-party
> strict-clearance freeze at the end of this packet supersedes the historical
> no-oracle/build-ready state, the §5.51/§5.52 print-loft builder and the
> `50bbc9bc` / `cf97a01b` freezes. The quarantined Armored Warfare GLB is measurement and
> visual-comparison evidence only; the playable remains original procedural
> geometry.

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

## Source-fidelity re-freeze (2026-08-11 — current authority)

The owner-supplied `type_99a2_armored_warfare.glb` is SHA-256
`35024b8262ae065153da0f704f1c42a66b4a8e239a46a525af76ee12c405043f`.
Its game title and unproven redistribution provenance place it in the
commercial-game quarantine: local visual measurement only, never a runtime
asset. No mesh, texture, material, animation or derived payload byte ships.
The obsolete §5.51/§5.52 block-stack/ERA-blanket builder is retired.

`buildType99ASource` is a new deterministic procedural build. A long, low
hull and sharp shallow glacis carry one connected low arrowhead turret with
long cheeks and chamfered aft shoulders. The gun root is integrated into the
primary shell instead of hidden behind proxy slabs. The open full-width
bustle has a recessed backing, upper/lower rails, deep side returns, corner
uprights and diagonal braces; its negative spaces are intentional cells, not
sky holes. Circular hatches, periscope clusters, a panoramic housing, compact
sights, smoke banks, MG and antenna collars reproduce the source roof cadence
and all terminate in visible seats. A louvred engine deck and layered rear
service field replace the former monolithic transom.

The game's native six-wheel running gear is retained. Six 0.44 m road wheels
use a compact 0.86 m cadence between distinct terminal gears, one continuous
linked-shoe course and raised/scalloped skirts that leave every wheel disc
legible. No donor wheel, end drum, band or track byte enters the vehicle.
Configured P95 dimensions are 7.35 m hull / 10.70 m overall / 3.70 m width /
2.50 m height; measured values are 7.33 / 10.67 / 3.71 / 2.50, so the
dimension row is 100. Floater score is 100 and parent audit is stranded 0 /
abutting 0 / dangling 0. Winding is zero reversed / zero mixed; the only
residual is one rear-left pixel (0.00%) with no visible wound.

The release-only bow correction narrows the lower nose inside the native
track lane and carries the outer glacis shoulders over the idler on raised
guard bridges. It preserves the certified upper silhouette while reducing
exact band clips from 204/16 to **17/16**, shoe collisions from 227/0 to
**0/0**, and enclosed top-down pockets from four cells to **zero**.

Freeze reproduces x2 at **`cf97a01b`** (52 meshes / 76,251 vertices). The
commercial print's fused/component registration is unusable as a shipping
geometry target, so the comparison row remains honestly cap-documented at
**4.0** | hull 4.0 / whole 8.3 / turret 28.5 / stations 28.1 / dims 100 /
floaters 100; it is not presented as a machine PASS. Gate JSON SHA-256 is
`5f0d6cccd1bf9391128fd744927f7453065f3c3dfece58c8e0a7f636b79f59a7`.

Fresh independent §B8 reviewed 42 distinct frames: fourteen paired source
views plus fourteen yaw-0 and fourteen true yaw-90 views. Its fixed vector is
`[9.2,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.3,9.3,9.2,9.3,9.3,9.4]`, floor
**9.1**, mean **9.24**. The entire gun, turret, roof suite and supported
bustle rotate as one; driver/glacis, engine deck, service field, skirts and
running gear remain hull-fixed. It found no fused duplicate mass, stranded
fitting, empty-air decoration, donor track or visible backface wound.
The critic explicitly confirms that the narrowed lower nose remains broad and
source-like, while the raised shoulders clear the idler with supported
continuity and no front-corner sky pocket. **KEEP `cf97a01b`; the §5.52
`8d13f030` freeze and pre-release
`d1ded13b` sitting are retired.**

### Remaining provenance/gameplay notes

- The historical NO-ORACLE flag is retired. The current commercial-game
  reference remains quarantined, so a clean-license ZTZ-99A source would
  still be welcome without changing the procedural-only shipping rule.
- reverseSpeedKmh 12 (spec) — the real 99A's hydromechanical drive
  reverses faster; gameplay call, not mine.

### Law notes for the bank (from the slice-3 round; k2.md carries the
### shared set — repeated headline here for the rulebook fold-in)
1. **FITTINGS-IMPORT-ONLY**: in extension modules (modern2/modern3),
   fittings come ONLY from the top-level `import { FITTINGS } from
   './profiles/kit.ts'`, dereferenced inside builder bodies. No
   `kitFittings()` exists (a slice-3 first cut invented one and threw);
   `KIT.fittings` attaches via queueMicrotask AFTER init and can be
   undefined in synchronous rigs. Smoke-load via tankFactory.ts — an
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

## r1 BUILD EXECUTED (2026-08-06, AFV/modern2 owner — authored from the
## §r1 DESIGN SPEC above; deviations + battery below)
Builder REPLACED at src/vehicles/modern2.js buildType99A (the ancient
builder retired); orientedSlab99 §C winding guard + muzzleBore99 §B3.1
device added module-level. ERA-DEF/GEOMETRY COUPLING executed in the
same edit: spec hullEra true-ups landed (glacis_era fr → 0.8, 0.95,
3.46, 1.42, 2.10; skirt_era sR/sL → 1.76, 0.55, 1.76, 1.15, 0.3, 3.45).

### As-built vs the design spec (deviations, all packet-lawful)
1. **Drum end ribs**: KIT.torus lies AXIS-Y — the spec's bare torus
   calls rendered flat donuts poking 28 cm past the stern; their
   donut-hole crescents were a symmetric 10+10-cell §B2 flood pair at
   (±0.88, z −3.94). Fixed: rx π/2 in the P.add call (z-axis rings).
   BANKED LAW below.
2. **Drums LEVEL** (spec's rx 0.22 nose-up dropped): tilted cylinder
   rims pinch plan slivers against the log/flap edges; axis-aligned
   plan rectangles cannot pinch. Log lengthened 2.2 → 2.4 to overlap
   the flap columns.
3. **LEFT exhaust port re-dimensioned**: the spec's box(0.45, 0.28,
   0.06) at x −1.63 puts 0.45 ALONG X → face −1.855, breaching the
   ±1.75 anchor (§D WIDTH-GUARD-BY-DRESSING — it silently rescaled the
   whole build ~3%). As-built: box(0.06, 0.28, 0.45) at −1.72 — an
   outward-facing plate, face −1.75 EXACT.
4. **Arrow-seam legibility** (the spec's own pre-registered weakest
   read): the 0.022 ridge strip vanished under the digital camo — seam
   widened to 0.05 + wedge top-edge catch-light strips (1.15 m, ±39°)
   added. The front now reads TWO planes meeting (r3 view-front).
5. **Bustle kit**: FITTINGS.spareTrackLinks seated turret-side left,
   ammoCan right, tarpRoll on the rack line — per spec; QJC88 'nsvt'
   pintle at (0.58, 0.745, −0.42) ✓ census.
6. **§B3.1 MUZZLE BORE (owner order 32a6946, post-dates the spec)**:
   buildGun len 6.55 → 6.508 capped body; bore stack at the 6.55 face
   (muzzleBore99: open wall + recess funnel + dark disc r 0.042 inset
   ~3 cm); **muzzle +7.20 world = 11.0 overall EXACT** held.

### Machine battery — AFTER (2026-08-06, official rigs)
- track-clip --exact: **0/0 band + 0/0 shoe** (BEFORE: 119/44 + 97/44).
- standard-check: clip ✓, §B2 flood **0** (after the rib/drum fixes;
  BEFORE-build measured 20 from the donut crescents), census
  **mg1+6d** ✓ (BEFORE: mg0+0d).
- turret-parent: **0/0/0** ✓ (drums/log hull-side, basket/whip/links/
  mg turret-side — the spec's parenting held).
- npm test 526 green. Resident invariance: t14 1d232727 / leo1a5
  2db02a84 byte-identical across three same-tree runs.
- Geometry hash **92331895** (56 meshes / 71632 verts).

### 14-view self-read (shots/afv-r1/type99a-r3/ + r3-yaw90)
Floor **~8.5**: front 8.6 (post-fix: arrow planes + widened seam +
dazzler pair + boot + bored muzzle), top 8.7 (welded plan + wedge tops
seat against the core — no §B2 sliver; drums/log/basket rear), close-
roof 8.7 (dazzler + pano pair identifiable at 1×, sight doors read as
doors), left/right 8.6 (FY-4 tile WALL vs the soft-kit rear — the
spec's contrast intent lands), rear 8.5, heroes 8.6. §H.4 acid: welded
arrow front + tile wall + JD-3/pano pair + NSVT-class MG + drums/log +
6 big dished wheels + digital splinter — vs t72b3m/t90a (cast domes)
and t14 (unmanned shroud) separable at a glance.

### Law notes banked this round (new)
1. **KIT.torus IS AXIS-Y**: a ring around a z-axis member needs rx π/2
   in the placement call — flat-donut end ribs are invisible from the
   side AND punch §B2 donut-hole crescents in the plan flood.
2. **TILTED-CYLINDER PLAN PINCH (§B2)**: tilted cylinders present
   elliptical plan silhouettes whose rim arcs pinch enclosed slivers
   against neighboring straight edges — keep stern furniture cylinders
   axis-aligned in plan, or bridge the pinch zones.
3. **BLUEPRINT BOX-DIMS ARE FULL EXTENTS**: box(w,h,d) takes full
   sizes — a "0.45-wide port on the flank" must put 0.45 along Z, not
   X; transcribing plate dims into the wrong axis breaches §D anchors
   silently (this build's −1.855 incident, caught by the mesh probe).

## r2 PRINT-LOFT REBUILD + RE-ACTIVATION (2026-08-08, §5.38 owner priority
## wave — "fully model a custom type99a based on this model")
The Type 99A2 print (public/models/community-candidates/
type_99a2_armored_warfare.glb, LOCAL-ONLY, md5 bbb31bfe66b734e8e75f8a1d7e945a14
pristine post-§5.49) VOIDS the 2026-08-06 delist: type99a RE-LISTED in
MODERN2_IDS. The r1 build above was authored BLIND; this round re-lofted
every station to vertex-measured print lines. The id GATES now — the r1
"FALSE-0 never gate" law is retired for this id. Owner dims ruling: 7.6 /
11.0 / 3.7 / 2.37 (the r1 3.5-width flag is RESOLVED).

### §5.49 orientation adjudication (this round's discovery)
The extract flagged the print BACKWARDS (glacis -z vs gun +z) + 2713-vert
interpen. Six raw-frame hull tells (dozer bow +z, two-plane glacis to a
0.70 toe, armored-skirt half +z, raised powerpack deck -z, log/rack -z,
driver fitting) agreed with the turret tells — print internally COHERENT;
the assert = the documented §D raised-rear-deck misfire (1.78 rear deck
tops the 1.50 bow run). Coordinator reversed the turret-180 repair,
restored pristine bytes, filed the misfire guard. Registration carries NO
yawOffset; first-pair render verified NOT reversed (no mirror-guard flags,
plan cover 0, gun-forward both models).

### FOLLOWER CENSUS COMPLETION (three harness maps, k2-depth)
Onboarding followers ^Object_(?:7|9|13|30)$ left turret furniture
hull-side. Vertex-verified extension to
^Object_(?:3|4|6|7|9|10|11|12|13|15|16|19|20|21|23|30)$: 3 roof trim /
4 cheek smoke banks (full-width y 1.81..2.28 z 0.33..0.48 band) / 6 roof
plate / 10+23 cheek rails / 11+12+15+16+19 side bins / 20 left mast /
21 sight wiper. vertex REG comment updated (extract models split loss
only — t14 note). Object_29 stays hull: headlights + RAKED MIRROR-STALK
strand (y 2.11@z1.95 -> 2.42@z0.45 — proc now authors it) + glacis rails;
its turret-handrail strand is the §E ask below.

### As-built r2 (buildType99A, print-lofted; ~30 measured lines in-code)
Frame: ±1.85 tile anchor; muzzle +7.20 = 11.0 EXACT; flap anchors ±3.775
(bands 0.48-0.58); stern overhang capped -3.91 (overall 11.12 = +1.09%).
Gear: 6 stations pitch 0.90 r 0.40, xc 1.46 trackW 0.60, idler y 0.62
r 0.34 / sprocket y 0.60 r 0.36 (print wrap arcs), contactZR -2.35, top
run 1.27. Hull: belly 0.385..1.305; deck 1.50 + powerpack ramp + raised
1.78 rear deck; TWO-PLANE bow (16.3° + 62° to the 0.70 toe) + dozer;
CHEVRON ERA arrow-field (4x4 per half, ±12° skew, forward-stepping tip —
§5.29 kinship); full-depth 3x11 FY-4 tile wall (rows 0.535/0.84/1.145);
stern plate -3.645 + log/rack. Turret: 17-pt UNDERCUT loft (flare 0.74,
walls ±1.66, roof 2.48 print-true) + wedge cheeks 0.52/0.92->1.74/0.30
shoulder 2.30 + arrow-seam prisms + boot-skirt canvas + smoke banks 2x5 +
side bins + bustle ±1.58 + basket; tower right-rear (cap 2.855), pano
left-rear, JD-3 on the left shoulder, sight conduit+head over the mantlet,
wiper arms, hatches, wind sensor + whips in the tower band; QJC-88 nsvt
at the commander station FORWARD (owner MG law). Gun: trunnion 1.94
(gunPivot y 0.52), boot collars + top cable conduit, sleeve/evac r 0.085
evacR 1.35, bored muzzle. turretPivot z 0.10 -> 0.28 + gunPivot z 0.55 ->
0.37 (r6 registered-frame decode; trunnion/muzzle worlds unchanged).
Armor FRAME true-ups ride the print lines (hw 1.85, roofY 1.50, trkTop
1.28, floor 0.385, tHalfW 1.62, tFrontZ 1.00, tRearZ -2.35, tH 0.98,
glacisNoseZ 3.30, glacisTopZ 2.02) — every RHAe VALUE byte-identical;
era-kind defs moved WITH the geometry (coupling law).

### Gate rows (honest; all runs bit-identical x2 where marked)
- r1 BASELINE x2 (HEAD worktree: blind build + re-list + owner dims +
  completed followers) BIT-IDENTICAL: min 0 — hull 1 / whole 10.2 /
  turret 0 / stations 40.3 / dims 0 (heightM +11.8%, hullLen +6.6%,
  overall +5.9%, width +0.2% — the ±1.75-anchor scale blowup) /
  floaters 0 (one-pose island).
- r2 ladder: r2 17/19/7.3/61/0/100 -> r4 (roof 2.48 + world-frame cheek
  bricks + flap profiles) -> r6 pivot shift (stations 71.6, st02 17->1.2)
  -> r7 FINAL x2 BIT-IDENTICAL: min 0 — hull 17.7 / whole 25.4 / turret
  29.7 / stations 71.3 / dims 0 / floaters 100. Candidate hash 8d13f030
  (58 meshes / 76945 verts).

### The two blockers (coordinator lane; each quantified from probes)
1. DIMS-DATUM (heightM): p95 body-column top cannot reach the 2.37 roof
   datum with the owner-mandated forward MG (its barrel line alone spans
   ~0.8 m of columns at ~2.7) + the tall sight tower; the print's own
   receipt reads heightPct +55.7. BOTH models read sights-inclusive p95
   over the roof datum = the documented §D DIMS-DATUM CLASS ("datum-
   reconciliation work order, not a shape defect"; t14 precedent re-filed
   2.7 -> 3.16 from the receipt). ASK: heightM 2.37 -> 2.86 (the tower-cap
   line; real-vehicle sights-inclusive). Proc p95 measured 2.93-2.97 —
   lands ~2.86 with the r7 cluster trims. Expected dims after ruling:
   ~95+ (len +0.21%, width +0.16%, overall +1.09%).
2. §E EXCISION (Object_29 turret-handrail strand): 196 verts above y 2.05
   at x -1.4..+1.0, z -1.05..+0.95 (left-edge rails y 2.42..2.56 + cross
   arcs) — turret furniture in the hull bucket; tops ~22 side-hull columns
   and ~24 front-hull columns the proc can never lawfully match (§B5
   forbids hull-side authoring at turret height). Measured cost ~-25 to
   -30 on side_hull AND front_hull + the dy skew both rows. Keep 29's
   headlight/mirror/glacis strands (y <= ~1.9) — proc authors them.
3. (menu) §E warp candidates for the 90 ladder: hull body z-scale x1.062
   about body mid (receipt hullLen -5.9%), gun tip -0.21 (overall +5.7%),
   roof band 2.48-2.56 -> 2.44 + tower 3.14 -> 2.9 + mast crop (heightPct
   +55.7), stern rack crop -4.24 -> -3.9.

### §B7 caps (print stylizations, dims sovereign)
roof band 2.48-2.56 (proc 2.48 plateau ✓ print-true after the datum-class
annotation freed it); tower 3.14 -> 2.855; masts 3.49/3.73/antenna 4.35 ->
whips ~3.1 + sensor 2.85; muzzle 7.41 -> 7.20 (11.0 EXACT); stern rack
-4.24 -> -3.91; center sight head 2.51 -> 2.545; print hull body 7.152
(-5.9%) vs the 7.6 anchors (cover ~2.5-2.8% both side rows); print body
mid +0.25 asymmetry (2-3 bow columns pair against the ref gun run).

### Machine battery (official rigs, this tree)
track-clip --exact 0/0 band + 0/0 shoe; standard-check: clip ✓ contig 0 ✓
census mg1+7d ✓; turret-parent: stranded 1 = ADJUDICATED AABB-artifact
(the fender mirror stalks poke the turret envelope; hull-true on the real
vehicle AND the print — kf51 class, documented negative), dangling 0;
floaters 100 x2; npm test exit 0 (equipment 166 + track-geometry green).
Resident invariance: t80u af5e3ad9, leclerc 206c5fd1 (the §K frozen
triumph ✓), leo1a5 1c79188, t14 60d7d14 — BYTE-MATCH HEAD-worktree
baselines; leo2a4 differs (12db10a0 -> b68e42c2) = the LEOPARD lane's
live uncommitted buildLeo2A4 WIP (profiles/leopard.js +297/-158,
PROFILED_BUILDERS override; modern2's copy is dead code) — not this lane.

### Evidence
shots/type99a/r7 + r7-yaw90 (14 views each) + gate receipts (baseline x2,
candidate x2) copied beside them; probe dumps + per-column analyzers in
the round scratchpad. Identity self-read: front (arrow cheeks + smoke
banks + tower-right + boot ✓), close-roof (chevron arrow-field + raked
mirror stalk on the print line + boot/sight cluster ✓), left (tile wall +
welded box + tower + sleeved 125 ✓), top/yaw90 clean.

### Law notes banked this round
1. HEIGHTM P95 BAND CONSOLIDATION: the 12% body filter never excludes
   columns standing over the hull — every tall roof fitting is a body
   column. The 5% p95 budget (~0.38 m of z) must be spent as ONE shared
   z-band; a mandatory forward MG alone can overrun it -> DIMS-DATUM
   CLASS, not geometry mutilation.
2. OVERALL-SPAN STERN CAP: overallLengthM is the muzzle-to-stern PIXEL
   span — stern furniture spends the same 1% grace the muzzle needs;
   cap overhang at (muzzle_z - 1.01 x overallLengthM).
3. TURRETLOCAL ERA PUT() COORDS ARE WORLD-FRAME (t90Cheek convention):
   seatEraBricks subtracts the pivot itself — turret-local puts hang
   bricks pivot-height BELOW their faces (r1 + candidate-r2 both hit it;
   gate-measured, now in-code documented).
4. TURRET-PIVOT REGISTERED-FRAME SHIFT: when every turret mismatch
   (front rise, bustle tail, rear stations, plan rear) agrees on one
   signed offset, shift turretPivot z and counter-shift gunPivot z —
   trunnion/muzzle worlds hold, and roof-cluster fittings that were
   world-correct must shift back by the same delta.
5. ORACLE-REGISTRATION COMPLETION IS A BUILDER DELIVERABLE on flat
   Object_N prints: AABB onboarding misses sub-1k-vert furniture; a
   vertex-level follower census (k2-depth) belongs to the first build
   round, with per-object evidence.

## 2026-08-12 first-party measured-envelope re-freeze

The owner rejected the prior hull, turret and running-gear geometry and
required the whole vehicle to be re-based on the supplied model while keeping
all playable geometry our own. The active `buildType99A` therefore consumes no
external geometry. It constructs a new tapered hull and two-plane prow, one
six-station native linked course, one connected low welded turret, buried cheek
courses, an integrated gun root, a supported open bustle and the complete
seated roof/service cadence from repository primitives. The historical
`buildType99AFullNativeRebuild2026` remains inactive and is not the registered
runtime builder.

The reference SHA-256 remains
`35024b8262ae065153da0f704f1c42a66b4a8e239a46a525af76ee12c405043f`.
Its measured 7.76 m hull / 11.66 m overall / 3.70 m width / 3.16 m combat-
station envelope are now the declared physical datum. The playable freezes
twice at `50bbc9bc` (53 meshes / 76,693 vertices).

Release receipts:

- machine fidelity 92.08; every valid whole view >=90.76; track profile 93.43;
- geometry gate 90.8 minimum, dimensions 100, floaters 100;
- exact native track band 0/0, shoes 0/0, blind spots 0;
- winding 0 reversed / 0 mixed, with only seven invisible rear-quarter pixels;
- 42 distinct final frames, genuine quarter-turn and fixed-vector floor 9.0 /
  mean 9.11;
- eight presentation assets current, muzzle-bore check PASS;
- full tests, native-playable audit, family-order test and public build PASS.

The winding yaw candidates are backed engine-deck louvres and the parent
abutting nominee is the fixed driver-periscope strip. Both remain visibly
hull-supported as the complete turret package rotates away. No comparison
mesh or derived payload ships; the public build strips the candidate source
directory. `cf97a01b` and all earlier Type 99 freezes are retired.

## 2026-08-12 strict-clearance and rear-seat re-certification

The current authored builder keeps the measured hull, angular turret, gun,
stations and native six-wheel course, but raises the sponson underside bands
and their shadow strips clear of the complete linked-shoe sweep. The left
exhaust and soot strip are moved outside the running lane. The rear recovery
cable tray is deepened to back the full U-loop and both returns, closing the
remaining plan pockets without creating a broad rear wall.

Current receipts for freeze `6d52abda` (58 meshes / 79,776 vertices):

- geometry gate 90.7, dimensions 97, floaters 100;
- independent procedural fidelity 93.0 with every required whole view >=90;
- exact band 0/0, individual shoes 0/0 and strict full-course sweep 0/0;
- standard check PASS with zero contiguity holes and `mg1+7d` decoration;
- 45 unique paired/yaw frames including `profile-elevated-left`;
- independent fixed vector
  `[9.3,9.4,9.3,9.3,9.4,9.3,9.3,9.4,9.5,9.5,9.4,9.5,9.4,9.5]`,
  floor 9.3, mean 9.39;
- full tests, asset currentness, muzzle-bore, native provenance, family order,
  and private/public builds PASS.

The complete gun, turret shell, cheek protection, roof stations, bustle and
slat rack rotate together. The repaired sponsons, exhaust, deck, rear tray,
U-cable, transom and running gear remain hull-owned. Fixed-deck candidates in
the heuristic parent/winding audits remain visibly connected to the hull after
turret departure and are not stranded turret mass. No source-derived geometry
or payload ships. `50bbc9bc` is retired.
