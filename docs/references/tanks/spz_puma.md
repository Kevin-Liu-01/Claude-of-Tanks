# SPz Puma (`spz_puma`) — NEW VEHICLE packet (AFV lane)

**Exact vehicle modeled:** Schützenpanzer Puma, Bundeswehr production fit —
low flat hull under the HIGH one-piece sloped bow, unmanned RCT30 turret
offset toward the driver side, 30 mm MK30-2/ABM with muzzle brake, coax
5.56 MG4 (the crew MG), PERI mast to the 3.6 m datum, twin Spike-LR box
launcher on the turret flank (elevates with the gun), ROSY banks, MUSS
heads, 6 big roadwheels + HIGH front drive sprocket, heavy near-deck-height
modular side armor, rear ramp, twin whips, NATO 3-tone, 'Y-514'.

## OWNERSHIP / ROUND STATE (2026-08-06, AFV lane r1)
Builder `buildPuma` + spec row live in **src/vehicles/modern3.ts**
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

## §B8 REWORK ROUND (2026-08-06, AFV lane — owner rejection + acceptance-critic orders)
Owner (verbatim): "puma needs a more centered turret and the same track shape
as bradley" + the §B8 rejection; numeric orders from
the archived visual-review receipt. Geometry hash **c8385d52 ->
31dca571** (64 meshes / 68500 verts).

**ROOT CAUSE FOUND (r1 bow):** the r1 "main glacis plane" frustum spanned
BOTH rings over the full bow z (a flat stacked slab, front face
near-vertical) — the critic's "chopped nose unit / parked bow" was this
authoring bug, not a numbers dispute. Same bug existed on type89 (its
whole glacis). Raked plates are now authored with the bottom ring at the
NOSE strip and the top ring at the CREST strip so the front face IS the
plane.

Done-gates (probe = tools/tmp-b8-measure.html, official rig):
1. TURRET RE-CENTERED (owner): pivot x 0.435 -> **0.15** (spec turretPivot +
   ring hitbox + gunPivot local -0.35 -> -0.065 so the gun tube HOLDS the
   print's world x 0.085; muzzle [0.085, 2.55, 2.466] unchanged). Probe
   turret box x [-0.830, +1.010] (center +0.09) vs before [-0.545, +1.295]
   (center +0.375). The print autoPivot 0.435 is documented as the
   residual-2 seat departure — owner order outranks the print; honest gate
   cost accepted below.
2. SIDE BAND SPLIT (order 1): module band y 0.62..2.13 -> **1.00..2.00** in
   two courses (upper 1.66..1.80 tucked, lower 1.70..1.86 flared = the
   front-view trapezoid, order 6); stern module 1.05..1.60; trim rail at
   the 2.00 step. Wheels (r 0.36, print stations) now read exposed with
   the tub wall behind — left view counts 6 + high sprocket + idler
   (§B8.1 gate 1 ✓, shots/afv-b8-rework/after/spz_puma/).
3. BOW SWEEP (order 2): ONE plane (1.92, 1.77) -> (1.40, 3.72),
   plan-tapered ±1.42 -> ±1.26 (order 4); shelf + chamfer DELETED; nose
   wedge filler to the print's 1.23 lip; face plate 1.00..1.44 keeps the
   hullLengthM body column; louvers moved ONTO the plane (rx +0.261 —
   plate-flush); WIDE shoulder facets close the plane edge to the sponson
   corner (outer-lower edge held 45 mm over the 1.482 SHOE-STACK envelope
   — see law note 4).
4. TURRET MASS CUT (order 3): walls raked 6 -> 11-13 deg, crown 2.785
   (~2.80 ordered), mast base 0.34x0.40 -> 0.24x0.30 stepped stalk, head
   top 3.60 EXACT (heightM datum); MUSS/rails/decals re-seated to the
   raked tops.
5. REAR/OVERHANGS (order 5): ramp face ±1.25 -> ±1.44 full-width + hinge;
   tow-hook rings z 3.80 -> 3.78, rear lamps -3.76 -> -3.745: overall z
   [-3.790, +3.800], l 7.590 (-0.13% vs 7.6).
6. TRACK SHAPE: print-true gear UNCHANGED (already the bradley raised-end
   trapezoid class — §B6 by construction); the exposure fix is the band
   lift. §B5 kit re-seat for the new pivot: rack -> (-0.85, -3.12), tow
   cable re-routed to the armor-band top step (old deck route fell inside
   the re-centered core sweep).

**Battery:** track-clip --exact 0/0 band + 0/0 shoe ✓ | flood 0 ✓ | census
mg1+12d ✓ | winding-audit m1 clean (7px @right, AA-noise) ✓ | m2 yaw
candidates 2670 (baseline 2829, fleet rank 8) = the r1-ADJUDICATED
rear-deck kit class (rack/cans/bergen), all inner corners r >= 1.56 vs the
1.499 swept radius or under the 2.25 sweep plane ✓ | npm test green.

**GATE (x2 IDENTICAL, honest):** min **0** | hull 39.9 (was 35.8 ✓ the
one-plane bow pairs better) / whole 18.1 / turret 0 / stations 20.3 /
dims **100** / floaters **100**. The turret_plan 0 + front_whole 18.1 are
the ORDERED seat departure (0.285 m); station tops pay the ordered band
top (2.00 vs the print's own 2.14-2.16 deck line). dims: heightM 3.6
(mast EXACT), length 7.59, width 3.90 — all anchors hold. If the owner
ever wants print-exact back: seat 0.435 + band top 2.14 are one-line
reverts (this section is the record).

Evidence: shots/afv-b8-rework/{after,after-r1..r4}/spz_puma/ (16-view
photoclass + 14 REF|PROC oracle pairs + measures.json four-box).
Graduate guard: ariete/type90/type74/t80u/bmp2/m2a2_bradley/
chieftain_mk10/type10 hashes byte-identical before + after (tmp-hashgeo).

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
4. **FLAT-SLAB GLACIS BUG (§B8 rework find):** frustum(bw,bzF,bzR,tw,
   tzF,tzR,y0,y1) with both rings spanning the full bow z builds a flat
   slab whose front face is near-vertical — the "sloped plane" comment
   lies. A raked plate = bottom ring at the NOSE strip, top ring at the
   CREST strip (the front face becomes the plane). Both AFV r1 bows had
   this; check any "one-plane" claim against the ring spans.
5. **SHOE-STACK CLEARANCE (§B4):** budget hull pieces over the gear
   against the SHOE envelope (pin caps to x xc+0.245, stack top 1.482
   here), not the bare band apex (1.395) — the first shoulder-facet cut
   cleared the band by 4 cm and still clipped 12 voxels.
6. **GATE FLOATER = PROJECTED ISLANDS:** the floater check is silhouette
   islands >400 px from frontRight — a hull-true part on a thin (5 cm)
   arm AA-vanishes at 768 px and reads as a sky-island (pods, 5/5 poses).
   Stalked furniture needs a plate-solid bracket (>=10 px projected), or
   must overlap body mass in projection.

## §B2 NO-AIR NOSE CLOSURE (2026-08-07, AFV round §5.18 secondary check — class PRESENT, closed)
The under-glacis check found the class here too: the bow plane hung
over an open nose volume — side-low views read THROUGH under the
plane's side edge, over the wrap front (which ends z 3.17), and out
the far side's backfaces (probe: 485/494 px windows at (z 3.07,
y 1.41) per side; the nose-wedge top 1.30 vs the plane underside
1.44-1.54 left the interior slot the windows aligned through). The
print is closed there: its side line sweeps unbroken to the nose lip
(3.72, 1.40) with the belly line rising to 1.23 at the nose.

### Changes (buildPuma only)
1. INNER NOSE WALLS x 0.94..1.00 per side, two z-segments (2.78..3.30
   on the under-bow rise, 3.30..3.70 on the lower-bow body) — the tub
   line continued under the plane (§B2 channel-pan: 3 cm inside the
   1.03 band inner face); top chords segmented so they stay inside the
   plane wedge as it thins (3-8 mm margins at the nose pinch).
2. BOW CORNER WALLS x 1.00..1.20, z 3.20..3.72 (3 cm clear of the
   wrap's 3.17 reach, §B4), bottom on the face plate's own 1.00 line
   (the print's rising belly), top sunk into the plane, front tucked
   into the face-plate band, plan under the plane's nose taper.
After: both bow windows DEAD (side-low 752/759 -> 267/265, remainder
wheel-train daylight at y 0.30-0.40 — class-1). Front/under views
unchanged where they read the SKIRT-HOVER class (±1.56, y 1.73..1.96,
884/878 px + (±0.93, 2.19) fql/fqr 444/344 px): that is the owner's
QUEUED fleet no-air sweep item ("side plates that might just be
hovering") — modular-armor standoff air, out of this round's scope,
inventoried here for that sweep.

### Done-gates
- geometry-gate x2 EXACT the standing ledger row: min 0 — hull 39.9 /
  whole 18.1 / turret 0 / stations 20.3 / dims 100 / floaters 100 (no
  regression; this mark's row is its own standing rebuild debt).
- winding m1 clean (rev 0 / mix 0); m2 HARD is PRE-EXISTING (fleet
  baseline 2026-08-06 carries the same stern candidates, 2829 px then
  vs 2670 now — nothing this round added sits near the ring zone).
- track-clip 0/0 + 0/0; standard-check contig 0, mg1+12d; npm green.
- hash 31dca571 -> d04e4c58 (64 meshes; verts 68500 -> 68716).

### Honest residuals
- Skirt-hover windows (above) — fleet-sweep inventory.
- The W1/W2 inner-wall bottom step at z 3.30 (0.50 vs 0.75) crosses
  the interior lower-bow/rise void — visible only from the low-rear
  track-lane angle, terminates each wall on its carrier solid.

## SEE-THROUGH / NO-AIR ROUND (2026-08-08, §5.35 rank-9 order)

MISSION: sweep verdict "rear-deck seam slot (top-down sky): y0-top 364px
center slot @z-3.63 + 102px corner; §B2 filled-decks law".

ROOT CAUSES MEASURED:
- The stern-body rear face (-3.60) to ramp front face (-3.66) left a 6 cm
  full-width z-gap; the rear deck step overhangs only to -3.61 — sky read
  through a 2.5 m transverse slot between the corner posts.
- The k-loop armor upper course stops at z -2.935; over the stern module
  (z -3.32..-2.90) only the lower course exists, so the sponson-to-module
  strip x 1.66..1.70 read sky top-down (102/34px).
- Bonus same-class finds fixed in-round: the roof grab rail floated ~4 cm
  over the raked roof (6 mm under-rail sliver, 320px y0-side-l-T / 396px
  y45-fql-T; standoff feet only SEGMENTED it to 336px), and all four MUSS
  heads + the jammer mast hovered over the raked roof plane — 129px
  GARAGE-VISIBLE islands at yaw 45 sides + 595-1055px -T islands (the
  t64bv1 hovering-bin class).

WHAT CLOSED (all in buildPuma, marker "see-through round 2026-08-08"):
- HINGE WEB PLATE: box 2.84x0.07x0.10 @ (0, 2.10, -3.63) — y tucks 15 mm
  under the deck-step/body/ramp tops (side + rear traces unchanged; the
  corner posts own that band in side view); z laps 20 mm into both faces.
  Top-down now reads a recessed hinge deck.
- STERN UPPER COURSE: box 0.14x0.42x0.42 @ (+-1.73, 1.79, -3.11) — the
  k-loop course grammar continued over the idler module; meets the k10
  module at -2.935; plan/side/rear interior (sponson wall + trim rail).
- RAIL FLUSH SEAT: the rail now pitches with the roof plane (rx 0.0403 =
  the wedge's own 0.06/1.50 slope) and sits 5 mm proud, bottom buried
  along the whole 0.92 m run (r1 feet removed).
- MUSS SEATS: per-corner y (0.70 / 0.71 / 0.749 / 0.749; jammer 0.76) —
  each base buried >=10 mm into the wedge roof; caps ride.

SWEEP BEFORE -> AFTER:
- y0-top 573 -> 73 (364px seam DEAD, 102/34px corner slots DEAD; the
  remaining 40/11/10px sit at the bow-corner pod region, pre-existing).
- y0-side-l-T 376 -> 0; y45-fql-T 396 -> 0; under-rail sliver extinct.
- MUSS islands: y45-side-l/r full-view 129px -> 0; y0-fqr-T 595 -> 0;
  y45-side-l/r-T 1045-1055 -> 0.
- Untouched FP/pre-existing classes (identical px to the pre-fix sweep):
  y0-rql 967 + front-low 317 + under-fl/fr 236/228 = under-pod/gun-air
  band (the named GUN-AIR FP class); rear-quarter 105-107px sensor-pod
  islands (pre-existing, floaters gate 100); tilt55 835px island
  (pre-existing, all yaws identical); y90 side 137/131 bustle-region
  (pre-existing); gear-tag wheel daylight rows.

GATE (x2 bit-identical, live tree, baseline same session):
  BEFORE  min 0 | hull 39.9 whole 18.1 turret 0 stations 20.3 dims 100 floaters 100
  AFTER   min 0 | hull 39.9 whole 17.9 turret 0 stations 21.1 dims 100 floaters 100
  HOLD-OR-IMPROVE: hull =, whole -0.2 (in tolerance), turret =,
  stations +0.8, dims/floaters =. (The row's 0-class is the known
  42manako-oracle mapping issue, pre-existing and untouched.)

EVIDENCE: shots/modern3-noair/spz_puma-BEFORE-top-364px.png +
spz_puma-AFTER-*.png. Geometry hash 940912c8 (64 meshes / 69688 verts),
tmp-hashgeo.

## §5.248 IFV-WAVE REFRESH (2026-08-17) — restored-print re-baseline
The §5.249 disk-restore round returned the print to
public/models/tanks/community/spz_puma.glb (bytes = the same-source
re-drop, md5 41bf64fe62ed8aa211f9437411b7a4d3 — verified against
community-candidates/spz_puma_42manako.glb this round).

HONEST RE-BASELINE vs the restored print (gate, live tree):
  min 0 | hull 39.3 whole 12.3 turret 0 stations 7.1 dims 100 floaters 0
vs the HEAD ledger row (39.9 / 17.9 / 0 / 21.1 / 100 / 100): the print
restore re-framed the render and (1) exposed a REAL proc-side §B5 defect
— the r-wave package's radio whips stood 0.3 m of air BEHIND the bustle
(the floater island at every pose) and its roofMG pot floated 0.18 over
the raked roof; (2) moved the ref-dependent rows a few points (the known
-4% print, normalize plan still FILED for the orchestrator §E lane —
whole/stations remain print-capped until the warp lands).

RUNG (this round, profiles/afvFamily.ts addPumaOraclePackage): whips
re-seated onto the bustle roof plate (z -1.56 -> -1.20, pot buried), MG
pot seated into the wedge roof (y 0.92 -> 0.735). floaters 0 -> 100.
Geometry hash 479ce768 -> 73ee54e0 (same 73 meshes / 82858 verts —
position-only rung). turret-plan 0 remains the OWNER-CERTIFIED §B8
centered-turret override cost (spec comment; unchanged). Close rows in
the ×2 section of the round report.

## §E EXECUTED — batch 64 (2026-08-17, §5.248 §E round)
The FILED normalize plan LANDED (repair_oracles.py batch 64): z ×1.0418
about the mask mid (raw -0.030), y ×1.0444 about ground, x untouched —
on the gate's committed-path oracle public/models/tanks/community/
spz_puma.glb (the community-candidates/spz_puma_42manako.glb copy stays
the untouched provenance archive; the two now intentionally differ).
Receipts: .bak = pristine d6fb2ecb… (== the packet's md5-verified
re-drop bytes), output 9714eacc… byte-idempotent ×2; landed bytes == sim
candidate; census (37, 38991, 21108). SIM == OFFICIAL GATE ×2
BIT-IDENTICAL: hull 39.3->**43.8**, whole 16.4->**23.0**, stations
13.5->**18.4**, dims 100 HELD, floaters 100 HELD; turret_plan 0 stays =
the OWNER-CERTIFIED §B8 seat departure (min unchanged at that override).
The post-warp re-anchor ("re-anchor from a fresh extract before any
column chase", residual-1) now applies — extract regenerated on the
warped bytes this batch.
