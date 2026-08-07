# SPz Puma (`spz_puma`) — NEW VEHICLE packet (AFV lane)

**Exact vehicle modeled:** Schützenpanzer Puma, Bundeswehr production fit —
low flat hull under the HIGH one-piece sloped bow, unmanned RCT30 turret
offset toward the driver side, 30 mm MK30-2/ABM with muzzle brake, coax
5.56 MG4 (the crew MG), PERI mast to the 3.6 m datum, twin Spike-LR box
launcher on the turret flank (elevates with the gun), ROSY banks, MUSS
heads, 6 big roadwheels + HIGH front drive sprocket, heavy near-deck-height
modular side armor, rear ramp, twin whips, NATO 3-tone, 'Y-514'.

## OWNERSHIP / ROUND STATE (2026-08-06, AFV lane r1)
Builder `buildPuma` + spec row live in **src/vehicles/modern3.js**
(AFV/modern3 lane, single owner). Registered in MODERN3_BUILDERS +
MODERN3_IDS; MODEL_SOURCE procedural (garage CUSTOM tab via the
provenance-intent classifier). Owner order 2026-08-06: "make the spz puma
as well" + "use the bradley on puma" — bradley recipe base.

## ORACLE STATE — REGISTERED (bradley flow, 2026-08-06)
`public/models/tanks/community/spz_puma.glb` — "SPz Puma" by 42manako,
CC-BY-4.0 (ATTRIBUTION.md "SPz Puma oracle drop"; §E provenance note:
embedded-extras license + the uploader's history vetted by the triage
lane the same day — 42manako's t-72b3m was registered by that lane after
the §E law banked; bradley/fv510 same uploader). Registration (all
additive, HELPER-EXPANDED mirrors of each other):
- tools/vertex-extract.mjs REG row (`turretNode '^turret$'`, autoPivot,
  `yawOffset -Math.PI/2` — raw nose +X, leclerc convention; extract flip
  false) + extract committed at docs/references/vertex/spz_puma.json.
- tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES.
- tools/visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES.
- tools/tmp-tank-critic.html CRITIC_REFERENCE_OVERRIDES.
The print carries a REAL articulated split (turret node + gun_rot with
shooter00/01 Spike tubes) but registers FUSED under turretNode like the
bradley (proc turret mask includes rig_gun — parity holds; autoPivot
prefers the artist's authored turret-node origin: gate [0.435, 1.947,
-1.319] = the real ring pivot).

## Corroborated dimensions (published)
| Measure | Value | Notes |
|---|---|---|
| Hull length | 7.6 m | overall = hull (MK30 muzzle stays behind the bow plane, print + photos; bradley convention) |
| Width | 3.9 m | the LEVEL-C armor datum — see reconciliation |
| Height | 3.6 m | the mast/optics datum (print's own PERI plateau, raw 3.64 pre-clamp) |
| Weight | 31.5 t | level A |

### WIDTH/FRAME RECONCILIATION (the bradley two-datum class)
The print's proportions read w/l 0.534 (4.06 m at length anchor). Spec
widthM 3.9 (level C, published) is the closest datum (-3.8%); 3.7
(level A) would deepen the safeScale clamp to -8.8% per axis. Under the
width-anchored harness the print reads **-4% UNIFORM** (k 0.9615):
bodyH 3.447 / hullMask 7.295 / overall 7.295.

### NORMALIZE PLAN (filed — orchestrator lane, §E warp law v2)
Per-axis vertex warp: **z ×1.0418** (7.6/7.295, about the mask mid) and
**y ×1.0444** (3.6/3.447, about ground); x untouched (the width anchor
already seats the box at ±1.95). Wheel-region ellipse distortion ~4%
accepted (batch-38 class). The BUILD is authored at published dims in
the POST-WARP frame (print gate values × those factors) — curve rows
pair ~exactly once the warp lands; the baseline below is the honest
pre-warp state.

## r1 BUILD (2026-08-06) — authored inventory
All silhouette stations = extract reads mapped x as-is / z ×1.0418 /
y ×1.0444 (docs/references/vertex/spz_puma.json).
- HULL: tub ±1.00 (3cm inboard of the 1.03 band face — §B2
  HOLES-NOT-CHANNELS), SPONSON ±1.66 flush to the armor modules (the
  real Puma's modules bolt to the hull flank; the r1 1.42 wall left a
  strap-segmented slit = 258 flood cells, closed structurally); deck
  2.085 center / 2.15 rear step; §B1 ONE-plane high bow: break
  (1.41,2.085) → (1.63,1.92) → (3.21,1.49) nose shelf → chamfer →
  body-thick bow face plate at ±3.74-3.78 (dims anchor, bradley r3
  law) + tow hooks to 3.80; glacis corner facets carry the rake into
  the flank shoulders (§B1 slope-motivates); lower bow inter-track
  ±1.00 (§B4: the raised sprocket wrap reaches z 3.17 at the band);
  stern undercut wedge + RAMP ±1.25 (door outline + handle + hinge
  line + corner posts + taillights + stay arms).
- ARMOR MODULES: 11 segmented blocks/side x 1.66..1.82, y 0.62..2.13
  (the front-view 2.10-2.19 tops OVER the side deck strips — the
  heavy-modular read), stern module over the idler wrap, seams, top
  trim rail, mount straps.
- WIDTH CARRIERS: bow-corner mirror/sensor pods at **±1.945 with a
  0.40 m z-band** (print's own ±1.93 pods z-fattened past the 0.35
  plan filter — bradley LEFT-RACK precedent) → widthM reads 3.90.
- GEAR (§B6): 6 wheels r 0.36 y 0.43 at the print's own uneven
  stations [1.791, 1.009, 0.247, -0.680, -1.430, -2.173]; HIGH front
  sprocket {2.658, 0.965, 0.34} + raised rear idler {-2.814, 0.84,
  0.29}; band xc 1.25 / trackW 0.44, topY 1.28, coveredTop.
- TURRET (unmanned RCT30 at the print's authored pivot [0.435, 2.03,
  -1.374]): raked low wedge core (§B1.1 both cheeks), bustle, roof
  crown 2.815; PERI MAST stepped tower with hooded head — **top 3.60
  EXACT = the published heightM anchor** (≥5 side columns, aligned
  with the print's own 3.35-3.50 mast band); WAO sight hood + lens;
  4 MUSS heads + jammer mast; ROSY banks both front corners on
  bracket plates; grab rail + conduit; turret whip + hull stern whip
  (the print's own spike columns).
- SPIKE-LR POD: turret-flank twin-tube box PITCHING with the gun
  (print shooter00/01 ride gun_rot; bradley TOW precedent §B5-legal):
  gun-frame x 1.07..1.53, world y 2.28..2.73, twin tube muzzles +
  lid rib + elevation arm + rear door.
- GUN (§B3.1 + MUZZLE BORE): cast mantlet collar + cradle; slim tube
  r 0.030 (sleeve segment 0.040) to the brake body r 0.048 with twin
  baffle rings; **bore stack at face 3.29** (open outer wall + inward
  recess funnel + near-black disc r 0.017 inset 3.4 cm — autocannon
  class); muzzle world 2.47 (the print's own 2.37 ×1.0418). Coax MG4 =
  FITTINGS.pintleMG 'mag' 0.55 recessed at the collar step (the CREW
  MG — census carrier; unmanned turret so no pintle) + port ring.
- §B3.2 KIT (census mg1+12d): towCable, lightCluster ×2 + brush
  guards + rear pair, spareTrackLinks (glacis), stowageRack (rear
  deck, loaded), jerryCans ×2, antennaWhip ×2, smokeBank ×2, bergen
  stowage row, driver hatch + periscopes ×3, engine louvres + left
  exhaust grille + soot, roof hatch seams, lift eyes ×4, mudflaps,
  'Y-514' plates.

## BASELINE (2026-08-06, gate ×2 IDENTICAL — honest pre-warp)
**min 7.7** | hullCurves 35.8 / wholeCurves 27.8 / turretCurves 7.7 /
stations 40.7 / **dims 100** / **floaters 100**
- dims: heightM 3.61 (0.2%) / hullLengthM 7.56 (0.52%) / overall 7.63
  (0.44%) / widthM 3.90 (0.07%) — every anchor did its job.
- stations wPct 0.74-1.49 (width matches); topPct big only at the
  stern mast columns (the y-frame offset).
- Rows decompose as the documented -4% frame: plan rows 62.6 (x is
  scale-true), side/front 28-40 (z+y offsets), turret_plan 7.7 binds
  (post-warp seat -1.374 vs as-measured -1.319 + the z stretch). The
  warp landing is the unlock; no build-side chase before it (dims
  sovereignty forbids authoring 4% small).
- visual-evaluator vs the oracle: **no RIG MISMATCH**, yawProxy ≤3.3°
  (most ≤1.5°) — registration/orientation proven. Evidence:
  shots/visual-eval-spz_puma/.
- Geometry hash **c8385d52** (64 meshes / 61480 verts).

## §B battery (2026-08-06)
- §B4 track-clip --exact: **0/0 band + 0/0 shoe** ✓
- §B2 standard-check flood: **0** ✓ (r1 found 258 — the hull-to-skirt
  slit segmented by straps; fixed structurally: sponson ±1.66 flush to
  the modules) | census **mg1+12d** ✓
- §B5 turret-parent: 1 stranded + 3 abutting = ADJUDICATED deck gear
  (AABB-coarse artifact class, bradley r1 tarp-roll precedent): bergen
  row top 2.23 UNDER the 2.25 bustle sweep plane; rack/cans re-seated
  so inner corners hold r ≥1.56 vs the 1.54 bustle-corner sweep; tow
  cable deck-side. Yaw-90 pair rendered (kit static, turret coherent):
  shots/afv-r1/spz_puma-r1-yaw90/.
- §B6: trapezoid by construction (both end wheels raised, print's own
  ramps). §B1 staircase: none (single-plane bow in co-planar pieces).
- npm test 526 checks green.
- 14-view self-read (photo class, shots/afv-r1/spz_puma-r1/): floor
  ~8.5-8.6 — identity tells all read (high bow, robot turret + mast,
  heavy modular wall, Spike pod, slim bored MK30). §H.4: separable at
  a glance from bradley (tall slab + TOW left), bmp2 (boat prow +
  cone), fv510 (ribbed strakes + manned box), type89 (long glacis +
  Jyu-MAT wings).

## Residuals / next-arc orders (honest)
1. The -4% frame cost on every curve row — UNLOCK = the filed
   normalize plan (orchestrator). Post-warp, re-anchor from a fresh
   extract before any column chase.
2. turret_plan 7.7 carries the post-warp seat by design; if the warp
   is refused, re-seat the turret to -1.319/1.947 and re-map the y
   stations to the print frame (one-session change, documented here).
3. The Spike pod reads as part of the turret base band at profile
   ranges (probe-verified present + correctly placed); a proud-face
   tone split is the candidate if the critic asks.
4. Mirror-pod width carriers pay ~2-3 plan columns/side vs the print's
   thin pods (certified — dims sovereignty, bradley precedent).
5. Icons = orchestrator lane (genIcons --tanks spz_puma).

## Law notes for the bank
1. **AUTHORED-PIVOT AUTOPIVOT CLASS**: autoPivot prefers the turret
   node's authored origin when it sits inside the loose box (loader
   2400-2416) — for artist-rigged prints the extract's turretPivot IS
   the real ring; author the proc seat there, not at the mesh-box
   center (bradley's turret_lod had no authored origin; this print
   does).
2. **POST-WARP AUTHORING FRAME**: when a normalize plan is filed
   before the build, author at published dims in the post-warp frame
   (print × the plan's factors) — the baseline is honestly low but the
   warp landing pairs the build without re-authoring (m26 arc,
   inverted order).
3. KIT.torus lies AXIS-Y — a z-axis ring needs rx π/2 in the P.add
   call (see the type99a drum-rib incident, same round).
