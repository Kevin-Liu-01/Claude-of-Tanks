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
