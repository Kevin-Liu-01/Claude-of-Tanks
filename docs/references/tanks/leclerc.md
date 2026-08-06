# Leclerc S2 (`leclerc`)

**Exact variant modeled:** Leclerc Série 2 (French Army, 2000s fit) — CN120-26
L/52, HL-70 gunner sight in roof, HL-15 panoramic, GALIX, no AZUR urban kit.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.88 m | en.wikipedia.org/wiki/Leclerc_tank; weaponsystems.net/system/310-Leclerc |
| Overall length (w/ gun forward) | 9.87 m | Wikipedia; steelbeasts.com sbwiki Leclerc |
| Width (over skirts) | 3.60 m | Wikipedia; weaponsystems.net |
| Height (turret roof / over sights) | 2.53 m roof; ~3.2 over pano/masts | Wikipedia; sbwiki |
| Gun (model, caliber, tube length) | GIAT CN120-26 120 mm smoothbore L/52 (~6.24 m tube), thermal sleeve, fume extractor, MRS | en.wikipedia.org/wiki/CN120-26; weaponsystems.net/system/886 |
| Road wheels / rollers / sprocket | 6 road wheels/side, 5 return rollers, FRONT idler, REAR drive sprocket | Wikipedia ("front-mounted track idler and a rear-mounted drive sprocket"); militaryfactory.com armor_id=100 |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: TALL NARROW autoloader turret — vertical
  narrow front face, angled cheek plates sweeping to long parallel slab
  sides, full-height squared bustle housing the autoloader; flat roof with
  ammo resupply panel lines aft; commander's HL-70 armored sight box on the
  roof right of the gun; slim HL-15/FINDERS panoramic periscope MAST
  (thin pedestal, small head) roof left-rear — not a fat tower.
- Mantlet/gun mount: LOW-SEATED gun in a wide shallow mantlet plate with a
  heavy collar; gun axis visibly low against the tall turret face.
- Hull front: compact (shortest modern MBT hull), clean single-plane glacis,
  driver hatch LEFT with 3 episcopes, splash ridge across the plate.
- Running gear + skirts: 6 wheels; front third of the skirts are thick
  armored blocks, rear two-thirds rubber sheet with vertical seams.
- Signature equipment: GALIX 80 mm dischargers splayed on both rear turret
  corners; side stowage baskets along the turret flanks; rear hull stowage
  rack/panniers; crosswind mast + two whip antennas on the bustle.

## Reference links (links only — no downloaded images committed)

1. https://en.wikipedia.org/wiki/Leclerc_tank — infobox 9.87/6.88/3.60/2.53
2. https://weaponsystems.net/system/310-Leclerc — spec table, layout
3. https://www.steelbeasts.com/sbwiki/index.php?title=Leclerc — turret/sight layout
4. https://en.wikipedia.org/wiki/CN120-26 — gun L/52 data

## Local GLB oracle notes

Path: `public/models/tanks/char_leclerc_andertan.glb` (CC-BY 4.0).
Width-normalized to 3.60: overall 9.80, height 3.07 (over masts). Gun axis
reads ≈ 1.93 m, roof plateau ≈ 2.35–2.40 m (slightly under the published
2.53 — small cap), pano/sight heads to ≈ 2.83 m, masts to ≈ 3.19 m; turret
side baskets widen the cheeks to ≈ 2.9–3.0 m; hull rear carries a stowage
rack overhang at 1.3–1.75 m height reaching the full 6.88 envelope; front
skirt blocks stand slightly narrower at the bottom than the track guards.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 81.5 | 82.1 | 89.6 | 71.2 | 65.4 | 82.0 | baseline (modern2 canonical builder) |
| 2026-07-30 | 83.0 | — | 90 | 76 | 65 | 81 | bespoke misc.js build: turret widened via cheek armor boxes + side baskets (3.02 m), roof 2.40, HL-70 armored head forward-right, THIN pano mast, raised engine run, rear hull rack, low-seated gun w/ trunnion roll |
| 2026-07-30 | 83.0 | 84.8 | 89.6 | 76.4 | 66.1 | 79.8 | r2/r3 final: gun len 6.17 (muzzle tips now register), taller/deeper mantlet plate, rack deepened. CAP: the oracle's hull rig node under-covers its glacis, so part of the procedural bow is scored inside the gun-overhang window — G plateaus mid-60s with the correct L/52 |

## GATE-V10 round-2 notes (2026-07-31)

dims repaired 100 → 86.6 → 99.9 across the round (heightM p95 discipline:
the crosswind mast moved to the print's single tall column at x −1.10,
centre antenna pot + pano head + HL-70 lid held under the 2.55 line, and
the round-1 whip pair stowed — the print carries no spikes at ±0.98).
Curve work applied: tall front skirt blocks (top 1.46, bottoms 0.48-0.90)
with the tracks pulled inboard to the print's ~1.60 outer edge (the old
build's track columns read to the ground at ±1.72-1.80 where the print
shows floating skirts). Standing min 9 (stations) — the remaining stations/
turret work needs the full measured re-lay this round gave a6/a5
(leoHullV3-class): the hull deck/glacis lines and the bustle scallop are
still the round-1 shapes. No caps — the andertan print is honest.

## GATE-V10 round-3 (2026-07-31, partial — dims recovery + flank re-lay)

Round standing: min 8.1 -> **21.9** (hull 45.4 -> 50.6, whole 37 ->
36.8, turret 14.3 -> 21.9, stations 8.1 -> **25.0**, dims **100**,
floaters 100). The kit-native end wheels at the measured ramp positions
first inflated hullLengthM to 7.14 (3.79%, dims 77.7): the pad-wrapped
far edges merged with the skirts in gap-inclusive columns and read as
BODY. Ends held to +-3.36 far edges (sprocket -2.94/1.02/0.27, idler
2.94/0.96/0.26) restore dims 100 — dims is a protected metric on this
tank — and the tightened hull z-range also re-phased the station slice
windows (stations 9 -> 25). The ref's outer ramp columns stay uncovered
(documented dims-sovereign trade, same law as leo2_revolution). Also this round: skirts SEGMENTED (station law),
6-wheel span re-laid to the measured contact patch [1.97, -2.52], pano
mast moved to the measured w -1.18 spike column, rear hull rack held to
the 1.29..1.57 band, bustle basket pulled inside the -2.52w turret
rear, deep mantlet housing to w 1.48 (ref side band 2.24).
Remaining (next round's work order): stations 25 — the turret-band
tops need the full a5 treatment (probe-driven cluster mapping); turret
rows carry ~0.3-0.5 m band errors across the autoloader roof furniture.
dims must be re-checked after any end-wheel retune (the +-3.36/3.40
far-edge guard).

## VERTEX ROUND r1 (2026-08-03, misc agent) — 21.9 -> 58.2 + normalize plan

Extract (`docs/references/vertex/leclerc.json`, REG appended with the lab
registration; the extract's raw-name matcher needed `^Cylinder\.?086$` —
GLTFLoader sanitizes the dot, the offline parser sees the raw name):
bodyH +9.1% / bodyLen -0.6% / hullMask +3.4% / overall -0.8% / width 0%.
The +9.1% p95 height is a 7-COLUMN furniture band only (pano head 2.76 at
world -1.65, TWO mast/whip spike columns at x ±1.0 z -0.93 topping 3.06,
antenna pots 2.76 at x~0); the roof plateau (2.35-2.45) sits UNDER the
published 2.53 — print otherwise honest. **Normalize plan authored**
(tools/vertex-normalize.mjs `leclerc`): tejas-W1b ceiling compress, knee
2.46, band -> 2.50, max 3.065 -> 2.541; z IDENTITY (hullMask +3.4% is the
REAL rear rack overhang, band 1.30-1.47, 12%-filter exempt — verify will
keep flagging hullMask; documented accepted-real-overhang). ORCHESTRATOR
lands the warp; furniture tops in the build already target the POST-WARP
lines (masts 2.54 at ±1.05/-0.93w, pano head 2.50 at -0.55/-1.65w, HL-70
lid 2.50-2.52 at 0.74..1.16w).

Round log (gate v11): 21.9 -> 53.7 -> 56.8/58.2 (dims dip repaired) ->
**58.2** | hull 62.9 / whole 58.2 / turret 62.1 / stations 58.7 / dims
97.3 / floaters 100. What moved it:
- skirts: REF stations carry full 3.60 width ONLY over the front blocks
  (i9-13, world z >~1.15); the rear two-thirds rubber sheet sits INBOARD
  at ±1.70 with a deeper band (0.53..1.51) — stations 25 -> ~64.
- front blocks hang 0.86..1.43 (not 0.48..1.46); fenders split: deck-edge
  plane (1.575, x<=1.70, z -3.42..2.95) + front flares (1.41, x->1.79,
  z 1.28..3.30).
- engine run FLATTENED to top 1.62 (the old raised 1.74 run was a misread;
  ref deck 1.618 across -2.45..-3.0).
- rear: deep body ends z -3.30 (plate face -3.31); the rack overhang is a
  THIN LADDER -3.40..-3.63 — top rail at 1.50 (a 1.29+1.555 rail pair
  spans a 0.30 column band = EXACTLY the 12% side filter, and hullLengthM
  read the rack as body: dims 71.9 incident, repaired to 97.3).
- turret: sloped aft roof (2.40 front -> 2.26 at the bustle end), DEEP
  turret-frame mantlet chin (band 1.26..2.23 to world z 1.57), forward
  cheek WEDGE pair sweeping to z~2.2 over the glacis, low outer applique
  plates (1.2..1.7 band at x->1.65, z 0.17..0.79), bustle tail rises to a
  thin top shelf (2.05..2.21 at -2.3), basket/kit inside world -2.32,
  whips STOWED, roof MG pintle added at the gunner ring (decoration law;
  tops at the 2.54 post-warp mast line — zero net gate cost).
- gear: wheels re-laid to the measured flat patch (centers 1.61..-2.16),
  sprocket -3.06/1.02/0.24; idler HELD at 2.94/0.96/0.26 — the r3 attempt
  to chase the ref's high idler (3.32/1.04/0.23, far edge 3.55) re-ran the
  round-3 dims incident (hullLengthM 7.19): the ±3.36 far-edge guard is
  LAW until the loader gains a wrap-exempt trace.
CERTIFIED-PENDING-WARP residuals (do not chase pre-warp): mast columns
(ref 3.06 vs build 2.54), pano/pot tops (2.76 vs 2.50), sight band, and
the bow nose-tip/idler-ramp ONLY-REF columns (dims-sovereign trade).
Boards: shots/misc-r1/after/leclerc.png (legacy visual 85.2; turret reads
chunky vs the print's slimmer cheeks — critic pass queued post-warp).

## Oracle warp verify note (orchestrator, batch-27)
height -1.4% / overall -0.8% / width 0% — in grace. hullMask +3.4% is the
REAL rear rack overhang (documented pre-warp by the r1 agent): the rack is
hull-node geometry past the hull plate, so the mask window includes it.
Expected flag; not a defect. Builders take hull length from published dims
(7.92 hullLengthM > mask window) per dims sovereignty.

## VERTEX ROUND r2 (2026-08-03, misc agent) — 55.2 -> 85.2+ GEO TARGET MET

Post-warp re-derive from FRESH workorders (r1 hull numbers retired as
instructed). Round log (gate v11): 55.2 -> 68.5 -> 71.9 -> 72 -> 74.1 ->
74.6 -> 83 -> 84.3 -> 84.7 -> 84.9 -> **85.2** (85.3 after the bow
containment restructure) | hull 86.6 / whole 85.3 / turret 87.5 /
stations 89.7 / dims 100 / floaters 100. What the print actually is
(all world-frame, from tools/vertex-workorder.mjs dumps):
- DECK LINE steps: 1.549 fore (-0.28..2.05) / 1.494 dip (-0.50..-0.34) /
  1.577 mid / 1.632 engine (to -3.05) / two 1.715 filler POTS at x ±1.05,
  z -2.27..-2.38 (not a full-width hump) / 1.605 tail lip to -3.28. The
  sponson band tops 1.49 UNDER these (it owned the r1 1.60 line).
- BOW: the raked glacis line IS the silhouette: (1.64,1.55)->(2.66,1.36)
  then TAPERED to x ±0.94 by z 2.78 and a narrow nose to (3.46,1.21) —
  the ascending track band crosses the full-width plane at z>2.75
  (containment law; the print itself interpenetrates there, we cannot).
  Front skirt blocks hang 0.86..1.43 + a SIXTH low block (0.86..1.24,
  z 3.23..3.53, inner face 1.68 CLEAR of the link pads) which is the
  3.497 hullLengthM body-column anchor. Outer mudguard strips x
  1.70..1.785 raked 1.445->1.235 carry the plan's 3.32 outer front.
- HIGH SHORT IDLER (3.16, 1.04, r 0.19, thin band trackTh 0.06): wrap
  top 1.40-1.44 IS the ref's 1.411 bump at z 3.15..3.26; far edge +
  pads 3.51 covers the 3.43..3.54 body columns. Sprocket (-2.86, 1.00,
  0.27): pad far edge -3.27 (pads add ~0.08 past the band — the 6.99
  hullLengthM incident). Wheelbase [-1.92, 2.12] (r1 sat 0.35 aft).
- hullLengthM measures col-center to col-center: body cols must be
  EXACTLY [-3.385, 3.497] for 6.88 — rear plate face at -3.36 (raised
  band 1.245..1.545 + step filler), rack rails 4 SEGMENTS with plan
  gaps at x -0.6/-0.15/+0.62, bags to -3.56 (overall 9.87 with the
  5.90 gun + muzzle drum r 0.146 — a 0.165 drum crossed the 12% side
  filter and hullLengthM swallowed the gun: 9.44 incident).
- TURRET: roof plateau 2.352 to z -1.42 then 0.201-slope to the 2.05..
  2.18 tail shelf; CENTER-RECESSED roof channel (2.248) between raised
  side bands |x| 0.30..1.05 (ref front-view center tops 2.25 vs side
  2.35 — impossible for a flat roof); roof edge chamfers (1.00,2.352)->
  (1.40,2.215); cheek complex: left front ~2.20w flat, right shorter
  with the gunner-sight WELL notch at x 0.55-0.70 (front 1.84w); side
  boxes bottom 1.60w/top chamfer 2.13->1.92w, outer face 1.545-1.555
  (1px off the 1.62 plan column); LOW applique band 1.246..1.60w (left
  z to 1.41w, right to 1.04w — print asym); baskets outer 1.5725 (plan
  x1.62 col sees it, front x1.605 col must NOT); tail: shelf tip right
  -2.17w only to x 0.90 / left -2.33w, center rear NOTCH x 0.0..0.14
  exposing the -1.81w rear face (rails+cage split around it); pano head
  at x ~0.05 z -1.66w top 2.49 (NOT x -0.55; also station-slice i3/i4
  boundary at -1.57w constrains its depth to 0.14); masts L -1.11/R
  +0.99 tops 2.53/2.54; MG receiver 2.40w by the mast (heightM p95
  anchors: sight lid 2.52 x4 cols + masts + pano = p95 2.52).
- GUN: axis 1.85 (r1 1.93 was high), r 0.085, fat junction collars
  0.132/0.126, fore sleeve band 0.138, muzzle drum 0.146 — every gun
  band HELD < 0.296 (the 12% filter).
TRACK CONTAINMENT: exact-audit rear 0 / front 56 -> bow restructure
(glacis taper + outer-strip-only flares + flap below the wrap arc);
gate re-verified 85.3 post-restructure. Boards: shots/misc-r2/.
Residuals if chasing 90: the mirrored one-sided ground columns at
front x ±1.64 (print asymmetry, ~2 cols), plan_whole rack-gap dither,
side_whole 0.56 cover col at the bag tail.

## MISSING-LEFT-SIDE ROUND (2026-08-06, misc agent) — owner report "ariete and leclerc are missing left side of turrets": ROOT CAUSE = REVERSED WINDING (6/21 slabs inside-out — the LEFT forward-cheek complex was a 1.45 m^3 invisible void). FIXED; gate HOLD 85.3 x2 EXACT; §B battery green incl. contig 0 + mg1 (both pre-existing reds repaired); §B3.1 gun-root tells landed at zero gate cost.

ROOT CAUSE (named: winding, NOT missing emit — the geometry was always
authored and always in the masks): same class as ariete this round —
KIT.slab's fixed ring handedness vs mirrored/reordered corner authoring.
Gate masks are DoubleSide (winding-blind); game/critic/standard-check
renders are FrontSide — reversed slabs are player-invisible and
mask-visible, which is how 85.3 carried a missing turret side. Full
mechanism note: ariete packet, missing-side round.

MEASURED INVENTORY (tools/tmp-misc-leftprobe.mjs):
- LEFT forward-cheek near-flat face slab (1.15 m^3!) + LEFT outer sweep
  slab (0.30 m^3) — THE OWNER'S REPORT: the entire left cheek complex
  over the glacis was culled; from the left the turret read as a stub
  with a floating gun (the "surface" a left ray hit at |x|~1.05 was the
  reversed slab's own INNER wall).
- LEFT roof-edge chamfer; LEFT side armor-box chamfer slab.
- RIGHT aft roof wedge; RIGHT outer mudguard strip. (Not left-only —
  handedness flips wherever authoring mirrored without re-ordering.)

FIX + HOLD: `orientedSlab` binding (see ariete packet). Gate x2 IDENTICAL
**85.3 | hull 86.6 / whole 85.3 / turret 87.5 / stations 89.7 / dims 100 /
floaters 100** — the r2 baseline to the decimal.

PROOF SET (shots/misc-leftside/{before,after}/): left/frontleft/rearleft
+ right trio + yaw-180 pairs; BEFORE frontleft shows the cheek void,
AFTER carries the swept cheek mass. Pixel diffs (t>4): left 4921 /
frontleft 10429 / rearleft 4260 / right 1691 / frontright 2923 /
rearright 1556, rects confined to the turret band. §B2 flood on left
views: no new enclosed sky (164 = the honest gear daylight band; turret
zone 0). Raycast asym rows 102 -> 71; survivors are the print's own
authored asymmetries (left-deep GALIX 5x2 + corner bin + left-biased
cage, right sight-well notch at x 0.54-0.70, left-longer cheek/applique
per the print).

§B BATTERY (official rigs, final bytes):
- track-clip --exact: front 24 band / rear 0, shoe 0/0, no blind spot.
  The 24 is PRE-EXISTING AT HEAD (attributed by HEAD-bytes swap run this
  round): a 2 cm sliver of the low bow side wall frustum (x ±1.68 wall,
  y 1.20-1.26 @ z 2.96-2.98) inside the dilated front wrap — under the
  ~60 band bar, visible-shoe layer clean. Documented residual (fixing it
  means moving a priced bow wall under a HOLD order — declined).
- turret-parent: 0/0/0 clean.
- standard-check: **contig 0 ✓ mg1 ✓** — both were PRE-EXISTING REDS at
  HEAD (r2 predates the v2 scan + census), repaired this round:
  (a) CONTIG: two ~6 cm cells per side at (±1.65, z 3.13-3.25) — the
  8 cm fender slot between track plane (1.60) and block/strip lane,
  ringed by pads/block/strip/flap. Closed with `fenderSlotShadowL/R`
  skins = the §C SHADOW-NAMED RENDER FURNITURE mechanism (mask-excluded
  by name — gate rows untouchable by construction; B2 truth scan counts
  them; the game renders the honest fender-slot shadow). x 1.655-1.70 =
  32 mm real clearance off the pad plane: clip audit unchanged at the
  pre-existing 24 (zero new voxels, measured).
  (b) MG CENSUS: the four hand-authored ANF1 pintle pieces migrated to
  FITTINGS.pintleMG (mag class, two-tone, elev 0, foot 0.95/0.578/-0.66)
  + the original sight/mount block kept at x 0.835-0.885 (it carries the
  priced 2.427w line). PRICED-FURNITURE SWAP law banked below: the first
  seat (default elev 0.06, foot 0.615/-0.75) cost stations -1.8 (slice
  i6 barrel line +0.05) and whole -0.1; attribution by disable-run
  (stations recovered exactly with MG off → the fitting, not the §B3.1
  tells), then elev 0 + foot -0.037 reproduced the hand pintle's barrel
  top (2.38w) and receiver band (2.29-2.39w @ z_w -0.85..-0.55) —
  85.3 exact.
  (c) 0d justification (§I): the remaining hand dressing (flank baskets,
  rear cage, rear hull rack, GALIX banks, corner bin) is
  silhouette-STRUCTURAL, gate-matched identity content measured into the
  r2 rows — same justification class as ariete's GALIX/basket note.
- npm test green (166 + track-geometry).

§B3.1 GUN-RUN TELLS (ordered): the fixed tube-root collar + chin stack
read as bare prisms at 1x (closeups: shots/misc-leftside/
gunrun-check/ vs after/). Landed, ALL interior to priced envelopes,
gate-proven zero-cost (85.3 exact with tells in): bolted face frame
plate + circular tube aperture ring on the collar face (z_w ~3.0), root
clamp collar at the collar-chin joint, side flange bolt strips (6.5 mm
proud, y inside the priced 1.70-2.10w band, x inside the ±0.15 plan
cols), dust-boot ring where the tube exits the moving mantlet plate
(r 0.12 < the 0.132 junction collar). The moving mantlet plate itself is
the real Leclerc read (wide shallow plate — identity cue) and the fat
junction collars/sleeve bands are cylinders.

LAWS BANKED:
1. (shared) MISSING-SIDE MECHANISM + ORIENTEDSLAB + MIRROR-LOOP CARRIER +
   FrontSide RAYCAST PROBE — see the ariete packet, this round.
2. PRICED-FURNITURE SWAP LAW (§I corollary): a fittings migration
   replacing HAND-TUNED mask content must reproduce the hand piece's
   mask FOOTPRINT, not just its census — the fitting's elev/foot/z are
   the knobs (elev 0 + sunk foot matched barrel-line and receiver-band
   here; a 3-5 cm barrel-line drift in ONE station slice cost -1.8).
   Attribute with a disable-run BEFORE tuning: it splits fitting cost
   from co-landed edits in one gate run.
3. REVERSED-SLAB INNER-WALL MIRAGE: a culled slab is not a clean void —
   probes/rays see its INTERIOR back-walls (the left cheek "surface" at
   |x|~1.05), which can masquerade as thin misplaced geometry. Trust the
   outwardness census, not the first-hit alone.

CERTIFIED/DOCUMENTED RESIDUALS: the r2 classes stand (mirrored one-sided
ground cols at front ±1.64 print asymmetry, plan_whole rack-gap dither,
side_whole 0.56 cover col at the bag tail); the pre-existing 24-voxel
front band sliver documented above; masts/pano/sight keep heightM p95
(dims 100 robust). Winding fix moved no mask row.
