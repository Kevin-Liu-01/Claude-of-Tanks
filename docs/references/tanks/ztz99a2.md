# ztz99a2 — §5.248 GROUND-UP REBUILD PACKET (china round, 2026-08-17)

## Order
§5.248 owner order: donor-clone (base type99a + kit package) replaced by a
complete first-party §K build, DISTINCT from the resident type99a. Spec
true-up per the round brief: the inherited AW-datum row (7.76/11.66/3.82/
3.24) -> the published band with §5.73-1 heightM.

## Instruments
- Print: public/models/community-candidates/ztz99a2_manako.glb —
  SketchUp-authored, inches, fused-by-material, WHOLE-VIEW ONLY (ATTRIBUTION
  §5.248 batch B). Orientation resolved this round: length on raw X, nose +X
  -> yawOffset -PI/2 (inches confirmed: width 140.14 units * 0.0254 = 3.56 m,
  roof-to-track 2.36 m vs published 2.37). Registered in
  tools/vertex-extract.mjs + the fidelity map.
- Published (batch-B REG receipts): hull 7.6 / overall 11.0 gun-fwd /
  width 3.7 over skirts / turret roof 2.37.
- Measure artifacts: docs/references/vertex/ztz99a2.json (post-yaw-fix).

## Spec true-up (src/vehicles/china.ts)
dims: 7.6 / 11.0 / 3.7 / 2.45 (was 7.76 / 11.66 / 3.82 / 3.24)
- heightM 2.45 = §5.73-1 P95 envelope (flat authored roof plane).
- silhouetteHullLengthM 8.18 / silhouetteOverallLengthM 11.55 /
  silhouetteHeightM 2.89: gate-frame measures of the registered build — the
  12% side trace and whole span include the rear drum rack the print also
  carries (print trace 8.50 / span 11.82 / P95 2.94); type99a
  silhouette-row precedent.

## Build (src/vehicles/profiles/china.js — buildZTZ99A2)
Ground-up: loftHull station hull (rear deck 1.72 per print, long shallow
glacis with three-course chevron armor + splash board, center driver
station), six big-wheel gear (rear drive, covered return), full-width fender
shelf + deep 6-bay side modules with forward ERA cassettes on the 3.70
datum, lower tub side strakes (print's 0.34 sponson wall), welded
polyMultiLoft wedge turret with the A2's DEEP cheek rake (+1.45 world nose
base -> +0.66 crown lip) + two-course add-on cheek cassettes + nose-beak
channel walls (§B3.1 elevation-clear), flat 2.45 roof, turret-side service
modules to the flank line, forward-left pano head + right gunner cabinet +
cupola W-85 + rear-right mast (print's roof layout), LWR pair, long bustle
basket (roof 2.42 to -2.70 world), 5-tube smoke banks, twin rear fuel drums
on transom brackets + center rack, ZPT-98 at axis 1.95 with print-band
evacuator, muzzle +7.02 = the print's tube, §B3.1 muzzle bore, '99A2'
flank decals.

## Gate history (whole|dims|floaters)
- BASELINE (donor clone vs new print): min 10.8 — whole 10.8, dims 93.3
  (shots/china-wave/ztz99a2-gate-baseline.json)
- first ground-up: whole 84.5, dims 0 (inherited silhouetteHeightM 3.49)
- + silhouette rows, wider turret, shelf, skirts, drums: 88.8 / 100 / 100
- FINAL (x2 BIT-IDENTICAL consecutive runs): min 88.8 = whole 88.8,
  dims 100, floaters 100 (shots/china-wave/ztz99a2-gate-final.json)

## Reverted / adopted experiments (receipts)
- Short rear whips (0.52/0.45): whole 88.3 -> 87.1. REVERTED to 0.65/0.55
  (tips on the print's own ~3.1 envelope).
- Drum aft-stretch to the print's -4.9 band: isolated A/B measured +0.4.
  ADOPTED (r 0.32 @ z -4.56).
- §B4 fixes: glacis chevron side-panel toes lifted above the idler shoe
  sweep (51 band vox -> 0); tow-cable end anchors tucked (11 vox -> 0).

## Residual (documented instrument ceiling)
The print reads ~4-7% long against its width datum (overall 11.82 vs
published 11.0; bow +3.75 vs the published-pinned +3.55) and its side band
is proportionally taller. Published dims anchor (round brief: WEAK
instrument partition). Remaining whole-view gap (88.8 vs 90) is that
stylization. Every other gate component is 100.

## Guards
- type99a donor byte-held: tmp-hashgeo 7f613788 before AND after (identical);
  its resident oracle package + profile row byte-identical to HEAD.
- type59 byte-held: ea1ff837 before AND after.
- track-clip-audit --exact --strict: 0/0 (band + shoes + sweep).
- npm test: GREEN (final state).
- Final build hash: ztz99a2 df0bf70c (60 meshes, 80219 verts).

## Evidence
- shots/china-wave/after/ztz99a2/ — 14-view photoclass + hero/muzzle shots
- shots/china-wave/diag/ztz99a2-*.png — harness ref|proc overlay masks
- shots/china-wave/ztz99a2-gate-{baseline,final}.json
(b8 oracle-pair stage failed on a pre-existing tmp-tank-critic.html vite
transform error — non-fatal; the diag overlays carry the ref|proc evidence.)

## §5.266 FIX ROUND (critic 8.3 -> ordered surgical list, 2026-08-17)
1. BAY RAISE: side-module bottoms 0.44 -> 0.62 (~half the wheel run reads,
   the print's own proportion; before/after pair shots/china-fix1/).
2. NUMERALS UNCLIPPED: re-authored into the inter-module gap (world z -0.96)
   OUTSIDE the widened belt wall (x 1.567 at that station — the old 1.42
   authoring sat inside the shell, the reseat rays back-faced and the marks
   were spliced; census receipts: both sides at z -0.87..-1.06, x 1.55..1.60).
   Authored cheek star preempts the auto-anchor insignia the widened modules
   half-clipped (census: star on the left cheek z +0.16..+0.39).
3. NOSE BROADENED: plan chord ~0.6 -> ~1.0 m (plan nose +-0.30 -> +-0.44,
   beak walls x 0.20..0.56 per side; elevation channel still clear, §B3.1).
4. CROWN RIM dressed (crownRimTrim) + lamp lenses toned (dark bezels + glass
   on the bow pods).
GATE: 88.8 -> 88.9 IMPROVED (x2 bit-identical), dims 100, floaters 100
(two §B4 offenders found and fixed mid-round: chevron toes + tow-cable
anchors -> 0/0 strict); npm test green; type99a donor 7f613788 byte-held.
FINAL HASH: 93c78198.

## Release 276: cheek redesign from photographs (cn-turrets-276, 2026-11-24)

Kevin, 2026-11-24: "clean up and redesign the vt 4a1 ztz 99a2 and ztz99a turrets which are a little messy esp with
cheeks, and need to be redesigned."

**Why the cheeks were messy.** Each cheek was a stack of separately typed pieces with no shared outline: a loft shell
that stopped at one plan line, a "closed chevron" lofted from six hand-typed stations that ignored that line, four thin
cassettes sampled along the chevron, and on the ZTZ-99A two beak prisms and a flank box on top. They crossed, overhung
and left slivers at every join.

**Mechanism now.** One turret plan outline per id (`src/vehicles/profiles/chineseTurretOutlines.ts`). The builder lofts
the whole shell, body and cheek modules, from it as one closed solid (`chineseTurretSolid.ts`). The face tiles are
closed blocks seated on its planar faces, and the combat plates (`type99Armor.ts`) are read from the same faces. Receipt:
`chineseTurretCheeks.selftest.mjs` (closed solids and cut parts, planar faces, seated and disjoint tiles, five planted
controls).

**Photographs** (reference only, never shipped; Wikimedia Commons): "ZTZ-99A tank front 20170902.jpg", "ZTZ-99A tank
front right 20170902.jpg", "ZTZ-99A MBT 20170902.jpg" (Military Museum, Beijing). In reality "99A2" was the pre-service
label for the ZTZ-99A. The game keeps two ids: `ztz99a2` is the production 99A as photographed, and `ztz99a` is the
early, pre-production 99A (Kevin's choice via Main, 2026-11-24).

### ztz99a2 (production)

| # | Region | Photo read | Baseline (was) | Fix (now) |
|---|---|---|---|---|
| 1 | Cheek plan | Two arrowhead modules. The front face runs from the mantlet notch outward and back about 25 degrees, and the outer face runs steeply back (about 60 degrees) to the side wall. | One Leopard-2A6-style chevron per side, swept from the throat to the shoulder in a single raked line. | Outline tip (0.41, 1.68), corner (1.06, 1.38), side join (1.56, 0.34): front face 24 degrees, outer face 64 degrees. |
| 2 | Cheek section | A vertical lower band (one tile row) under a long sloped top (two tile rows) that climbs to the roof. | Upper and lower faces meeting at a horizontal ridge (a side-section chevron). | Band 0.155 to 0.40, then a top sloping 0.58 m back to the 0.815 roof (36 degrees). |
| 3 | Tiles | Large flat FY-class tiles in rows on the band and slope of both faces; the star sits on the outer face. | Four thin cassettes per side laid along the chevron, gapped and overhanging at their ends. | 36 closed tiles: on each face a band row of three and two slope rows of three, 24 mm gaps, 30 mm from every edge, sunk 4 mm. |
| 4 | Joins | The modules are one welded volume with the turret body. | The shell, the chevron and the cassettes crossed one another, leaving slivers. | One solid: the module faces are the shell's own faces, with no join to gap. |
| 5 | Gun channel | The mantlet sits in a notch between the modules' inner faces. | Unchanged 0.80 m channel. | Unchanged; the cut walls are capped and closed (chineseChannelWallCaps). |
| 6 | Floor | The modules' undersides sit just over the hull deck. | Chevron chins at y -0.04, lifted by the turret seat at build. | The floor stands on the seat plane (0.155), so the seat moves none of it. |
| 7 | Roof kit | Cupola, sights and warning heads on a flat roof. | On the old crown (0.80 to 0.82). | Flat roof at 0.815; every fitting seated (donorStockSeating). |

### ztz99a (early 99A)

| # | Region | Read | Baseline (was) | Fix (now) |
|---|---|---|---|---|
| 1 | Cheek plan | The same arrowhead method on a blunter outline. | A welded wedge loft plus a six-station chevron, four cassettes and two beak prisms beside the gun. | Outline tip (0.41, 1.60), corner (1.00, 1.20), side join (1.50, 0.20). |
| 2 | Cheek section | A taller band; bare welded slope. | Wedge plus chevron. | Band 0.16 to 0.45, then a bare top sloping 0.50 m back to the 0.89 roof. |
| 3 | Tiles | One row of large tiles on the band. | Four thin cassettes per side. | 8 closed tiles: two on each band, 30 mm gaps. |
| 4 | Clutter | None at the module's flank. | A box and dark strip at z 0.39 standing through the flank, a crown rim trim, two beak prisms. | Gone; smoke banks moved to the side wall behind the module, warning boxes seated on the roof. |
