# AMX-40 (`amx40`) — NEW VEHICLE packet (FRANCE lane, §5.38 owner priority)

> **CURRENT STATUS (§5.93, 2026-08-10): GRADUATED.** The r2
> owner-source completion record at the end of this packet supersedes the r1
> pre-normalization ceiling, next-arc list and old `25633150` freeze below.

**Exact vehicle modeled:** AMX-40 export main battle tank prototype
(GIAT/Atelier de Construction d'Issy-les-Moulineaux, 1983-85, 4 built —
never adopted; the Satory/Saumur demonstrator fit): tall long hull with a
flat low bow platform, stepped REAR-RAISED engine deck, full-length
skirts, 6 roadwheels + rear drive; low wide WELDED turret with an
asymmetric plan-swept front (strongly-sloped front-LEFT plate), prominent
full-height mantlet, LLLTV camera box on the mantlet left, 20mm F2 coax
tube on the right, boxy gunner sight on the right roof, commander cupola
LEFT + center panoramic sight, long flank stowage boxes, twin rod
antennas; GIAT CN120-25 120mm smoothbore (thermal sleeve, NO bore
evacuator — compressed-air scavenging), 7.62 AANF1 roof MG (FORWARD, low
mount), export-demonstrator sand livery, 'AMX 40' skirt branding.

## OWNERSHIP / ROUND STATE (2026-08-08, france.js r1)
Builder `buildAMX40` + spec row live in **src/vehicles/france.js** (NEW
module, orchestrator-stubbed and wired into tankFactory at the marked
extension hook; single owner = the france lane). Registered in
FRANCE_BUILDERS + FRANCE_IDS; specs merge at import (modern3 pattern);
MODEL_SOURCE procedural. leclerc/amx30/amx30b2 stay in profiles/misc.js
(family migration = separate owner-approvable move).

## ORACLE STATE — REGISTERED (LOCAL-ONLY QUARANTINE)
`public/models/community-candidates/amx-40_armored_warfare.glb` —
"AMX-40 (Armored Warfare)" by KojfDiscord. PROVENANCE INCONCLUSIVE
(title names the commercial game; embedded CC-BY-4.0 tag alone is not
proof — ATTRIBUTION.md "KojfDiscord series" entry, §E provenance law):
**measurement/influence ONLY, never ships**; the playable is this
procedural build. Registered by the orchestrator wave in all three
harness maps (procedural-fidelity / visual-evaluator / tmp-tank-critic:
`turretNode ^Object_12$`, `gunNode ^Object_20$`, autoPivot,
`turretFollowers ^Object_(?:2|5|6|7|8|11|14|15|24)$`) + the
vertex-extract REG (no followers field there — see the extract-split
note below). Extract receipt: **docs/references/vertex/amx40.json**
(2026-08-08, this round).

## Corroborated dimensions (published)
| Measure | Value | Notes |
|---|---|---|
| Hull length | 6.8 m | |
| Overall length | 10.04 m | gun forward |
| Width | 3.36 m | over skirts |
| Height | 2.62 m | r2 source-body/P95 envelope datum; the older 2.38 m bare-roof interpretation is superseded |
| Weight | 43.7 t | export prototype |
| Engine | 1100 hp Poyaud V12X | 70 km/h |
| Gun | 120mm GIAT CN120-25 | manual loader (crew 4), 20mm F2 coax |

## ORACLE FRAME (extract receipt, as-loaded)
Loader chain binds the **height×1.30 clamp** (raw z-up masts to 5.12);
safeScaleK **clamps at 1.65** (width would want 1.6535) — net the print
lands PUBLISHED-TRUE on x/z: width 3.353 (-0.2%), bodyLen 6.796 (-0.1%),
hullMask 6.853 (+0.8%), overall 10.027 (-0.1%), and the turret roof
plateau sits at **2.385 = the published 2.38 datum**. bodyTop reads
3.086 (**heightPct +29.7**) — ENTIRELY the optics tower + masts:
- cupola dome to 2.77 / pano head 3.09 over gate-z -0.75..+0.8 (the
  real vehicle IS ~3.08 to the sight head; published heightM rides the
  roof datum — the k2 "RWS band" / t90m furniture-band class);
- two vertical rod masts: left-rear (x -1.0, z -1.68) to 4.14,
  right-front (x +0.72, z +0.74) to 5.10 (each 1-2 columns — p95-safe
  for the ref's own read, station slices i3/i8 own them);
- fused-shell interpen note: 4420 turret verts dip to 3.55 below deck
  (mast bases/skirt-zone bake — print-internal, harmless to masks).

### EXTRACT-SPLIT NOTE (tooling)
vertex-extract REG carries no `turretFollowers` — its per-part rows
count Object_2/5/6/7/8/11/14/15/24 as HULL, so the receipt's side_hull
tops read turret furniture (2.1-2.7) over z -2.25..+2.5 and the tower
(2.66-3.09) over the ring zone. The GATE's split (harness maps) parents
them to the turret. Authoring used the receipt's clean hull zones + a
follower-aware vertex probe (scratchpad, this round). If a future
extract wants gate-parity hull rows: add a followers field to the REG
row (additive, orchestrator lane).

## NORMALIZE PLAN (FILED — orchestrator §E lane, warp law v2)
t90m batch-23 knee class: **y-knee at 2.39** — roof and everything
below UNTOUCHED; compress the band above the knee so the optics tower
(2.39..3.11) maps to ~2.39..2.41 (post-map p95 ≤ 2.40, inside the 1%
dims grace) and the two rod masts fold to the same cap (or excise
Object_24 — k2-note antenna class — if the knee's mast read looks
degenerate). Y-only, about the knee plane; x/z untouched (already
published-true). The BUILD is authored at published dims in the
POST-WARP frame (spz_puma packet law note 2): optics band capped at
2.40, whips low-raked at the print's own mast seats — curve/station
rows in the tower zone pair once the warp lands, no re-authoring.

## r1 BUILD (2026-08-08) — authored inventory (all lines = receipt reads)
World frame; receipt curves quoted as (z, y) or plan (x, z).
- HULL side line: stern lip 1.662@-3.40 chamfer to 1.758@-3.27; engine
  plateau **1.763** (z -3.27..-2.28); step course **1.738**
  (-2.28..-1.72); ramp down to the **1.658 fore deck** (-1.72..-1.05,
  under the bustle); fore deck 1.658 to z 2.06; upper glacis ONE plane
  (1.658, 2.06) -> (1.508, 2.50); BOW PLATFORM near-flat (1.508, 2.50)
  -> (1.492, 3.26); nose chamfer to the upper lip (1.225, 3.30); the
  UNDERBITE beak — face leaning FORWARD going down to the jaw lip
  (1.048, 3.42), the receipt's own bellyCorners rise — with OUTER bow
  noses at 3.398 over the track lanes and inboard mud flaps at ±0.51
  (the print's own 3.43 plan columns); lower bow plate (1.048, 3.42)
  -> belly 0.44 @ 2.72; rear plate face -3.380 with the kit proud to
  -3.395 + stern undercut (0.44 -> 0.70@-3.382).
- SKIRTS (§D width anchor): main run faces ±1.648 (the ref's own slice
  line) with TWO ±1.68 width carriers = published 3.36 (the mid module
  z -0.99..-0.51 + the raked-hem front panel z 2.35..3.18, both like
  the print's own widest bands); hem 0.651, top 1.33; 5 flush panel
  seams; 'AMX 40' branding decals on the carrier module (Satory
  demonstrator); §B4: inner faces ≥1.614 vs shoe reach 1.542; all runs
  station-segmented at ≤0.48 pitch.
- GEAR (§B6 trapezoid): 6 wheels r 0.36 @ y 0.44, xc 1.29, stations
  ±[2.15, 1.29, 0.43], trackW 0.52; RAISED BIG-HIGH end drums for the
  print's 45° ramps — idler {2.72, 0.70, 0.28}, sprocket {-2.70, 0.67,
  0.24 — §B4 crest law} (receipt wrap lines 0.28@2.68 -> 0.76@3.18);
  contact 2.36/-2.30; coveredTop (full skirts).
- TURRET (ring at the print's own authored pivot z **-0.26**, receipt
  registration turretPivot [-0.001, 0.945, -0.257]; local = world -
  [0, 1.60, -0.26]): ring-zone floor 1.56..1.66 (the receipt's recess
  bots); walls ±1.345, roof plateau **2.385**; FRONT = flat nose plate
  x -0.82..+0.73 @ z 1.545 (near-vertical rake, top edge 2.24@1.495) +
  front-roof chamfer to 2.385@1.35; LEFT cheek ONE plane sweeping
  (-0.82, 1.805L) -> (-1.345, 1.42L) [the strongly-sloped identity
  face]; RIGHT cheek TWO facets (+0.73 -> +1.00 -> +1.345); BUSTLE
  right-deep rear (receipt: right/center -2.31, left -2.23), corners
  chamfered to ±1.04, roof raking 2.385 -> 2.32, underside 1.79 over
  the deck ramp (the print's own 3cm float); rear center rack bin to
  world -2.378 (print -2.38/-2.41).
- FLANK BOXES (identity): two modules/side, outer ±1.53, y 1.71..2.20,
  z -1.61..+0.63 (receipt Object_8), lid seams + latches; left-rear
  wall bin (Object_7: -2.23..-2.00).
- OPTICS BAND (post-warp frame, every top ≤ 2.40): gunner sight box
  right-front (z 0.94..1.41 print band) + brow lid 2.400; commander
  cupola LEFT at z_w -0.55 + episcope ring (print front cols
  -0.65..-1.17, side dome zone -0.74..-0.37), dome 2.395; pano
  plinth+head CENTER at z_w -0.13 (print peak cols -0.28..+0.01),
  head 2.400; loader hatch right-rear 2.393; smoke banks 3-tube on
  the BUSTLE FLANKS (tips ≤2.29 — the print's aft-roof 2.43-2.52
  discharger band lives in the filed plan); whips clipped low over
  the aft roof (tips ≤2.40; the print's vertical mast seats x -1.0
  z -1.68 / x +0.72 z +0.74 documented in the plan).
- MG: 7.62 AANF1 = FITTINGS.pintleMG 'mag' on a LOW recessed pedestal
  beside the cupola, FORWARD rest (CROWS-forward law; type10
  published-line precedent — a roof-standing MG owns heightM p95).
- MANTLET cluster (gunMount, pitches): housing x -0.70..+0.60 y
  1.67..2.27 z 1.56..2.28 + crown chamfer 2.36 + face plate to z 2.40
  (print Object_15 face 2.39) + recessed embrasure; cast cradle collar
  ±0.16 to z 2.93 (Object_14); LLLTV camera box LEFT with window +
  lens hood (Object_5: x -0.91..-0.27, z 1.89..2.14); 20mm F2 coax
  RIGHT at x +0.39 to z 2.81 with muzzle ring + bore dot (Object_2).
- GUN (§B3.1 + muzzle bore): CN120-25, axis world 1.94 (receipt
  gunContour axisY 1.937-1.945), trunnion world z 1.30; NO EVACUATOR;
  tube r 0.070 with sleeve A r 0.125 (z 2.93..4.62), bare gap, sleeve
  B r 0.110 (5.50..6.36), clamp rings; muzzle r 0.076, bore stack at
  face 6.64 = **overall 10.04 exact**.
- §B3.2 kit: lightCluster ×2 on the bow platform, towCable, spare
  links, pioneer tools, engine intake mesh + louvres + fillers, rear
  grille + taillights + guards + tow hooks + jack + spare links +
  soot, driver hatch + 3 periscopes, splash V, lift eyes ×4, mud
  flaps ×4, bustle rack + stowage + jerry can + ammo can, French
  registration '675 0102', turret '02'.
- VISUAL: solid export sand '#96835a' / weather '#a4916a', black-ish
  text decals; trackWidthM 0.57 (visual), camoScale 0.5.

## Print-cap ledger (pre-warp, documented per §GEOMETRY-GATE caps)
Until the normalize plan lands, the tower/mast deltas are ORACLE
STYLIZATION vs the published height datum (dims sovereignty forbids
authoring them):
- side/front whole+turret rows: ref tops 2.43..3.09 over z -0.75..+0.8
  (~15-19 columns) vs build's 2.385-2.40 caps; ref mast columns 4.14 @
  z -1.68 (~2 cols) / 5.10 @ z +0.74 (~2 cols) vs build's ≤2.36 whips.
- stations: i3 (z -1.714, ref top 4.143) + i8 (z +0.734, ref top
  5.102) = the mast slices (trim-eaten); i5/i6/i7 (ref tops 2.769 /
  3.087 / 2.866) = the tower slices — honest residual until the warp.
- hull rows are CLEAN of the class (tower is turret-side in the gate
  split) — no cap claimed there.

## r1 ROUND RECORD (2026-08-08, france lane — NEW BUILD + ladder r1..r10)

### Gate ladder (all runs single-config, live-tree marker verified)
| run | min | hull | whole | turret | stations | dims | change |
|---|---|---|---|---|---|---|---|
| r1 honest baseline | 40.6 | 81.1 | 40.6 | 62.6 | 40.7 | 79.4 | first light |
| r3 | 38.5 | 83.3 | 38.5 | 64.3 | 45.7 | 94.1 | MG to the datum (heightM 2.45→2.40), rear-band trim, lamps/eyes/splash low, underbite beak, skirt depth bands, mantlet steps, elliptical sleeves |
| r4 | 38.5 | 82.1 | 38.5 | 62.6 | 46.2 | **100** | flush rear kit (plate -3.380/kit ≤-3.395), front pulls, cheek rails, stepped right-rear bustle |
| r5-r6 | 38.6 | 82.1 | 38.6 | 62.3 | 53.8 | 100 | STATION SEGMENTATION (≤0.48 pitch — edge-on prism law), carrier/seam/strip width trims |
| r7 | 38.6 | 82.8 | 38.6 | 62.7 | 52.1 | 100 | SHADOW-STRIP MASK LEAK fix (see law note) |
| r9 | **41.4** | 83.4 | 41.4 | 62.5 | 52.6 | 100 | 45°-ramp end drums (idler y0.70 r0.28 / sprocket y0.68 r0.26) |
| **r10 FINAL** | **38.6** | **83.7** | **38.6** | **62.4** | **52.2** | **100** | §B4 sprocket crest fix (r 0.24 — shoes cleared the sponson floor; the r9 +2.8 was §B4-dirty and reverted by law) |

**FINAL ×2 bit-identical:** min 38.6 | hull 83.7 / whole 38.6 / turret
62.4 / stations 52.2 / **dims 100** / **floaters 100**.
dims: heightM 2.40 (+0.92% in grace) / hullLengthM 6.85 class /
overall +0.35% / widthM 3.36 (0.05%).
Geometry hash **25633150** (59 meshes / 64668 verts, tmp-hashgeo).

### §B battery (r10 bytes)
- §B4 track-clip --exact: **0/0 band + 0/0 shoe** (the r9 blind-spot —
  sprocket crest shoes 1.9cm into the 1.06 sponson floor — closed by
  the r 0.24 drum; crest+shoes 1.04).
- §B2 standard-check: contig **0** ✓, census **mg1+8d** ✓, clip 0/0 ✓.
- §C winding-audit: m1 clean (rev 0 / mix 0), m2 clean (yaw candidates
  0). No missing-side class.
- §B5 turret-parent: stranded 2 + abutting 1 = ADJUDICATED DECK GEAR
  (AABB-coarse class, bradley/puma precedent — the tool clamps the
  casting floor to ringY-0.10=1.50 and smears over deck kit): the tow
  cable (crowns ≤1.73 vs the 1.79 bustle sweep plane) and spare links
  (moved to z 1.62: r 2.17 > the 2.04 core corner sweep; audit
  fraction fell 100%→28% residual AABB overlap). Static hull kit by
  construction; yaw-pair render = critic-round follow-up.
- visual-evaluator: **no RIG MISMATCH**, yawProxy ≤2.7° (most ≤1.3°) —
  registration + orientation proven; §5.49 presentation check: gun
  forward on BOTH models in every pair, print NOT reversed. Evidence:
  shots/visual-eval-amx40/ (report.json + overlays).
- npm test green (28/99/166 + combat + track-geometry suites).

### PRE-WARP CEILING (the honest read — §5.38 t90m class)
wholeCurves/turretCurves/stations are CAP-BOUND by the print's optics
tower + rod masts over the published 2.38 datum (the filed knee-2.39
normalize plan releases them; the build is already authored in the
post-warp frame):
- front_whole 38.6 (mean 4.23 / p95 17.8): mast columns x ±0.72/±1.01
  (errM 0.91-1.36) + tower center cols (errM 0.37) own the row = THE
  MIN. side_whole 70.4: mast cols z_w -1.68/+0.74 (errM 0.87-1.36) +
  tower band z -0.75..+0.8 (errM ~0.33 × 15 cols).
- side_turret 62.4: same columns (ref tops 2.43..3.09 + mast bases
  4.1/5.1 fused into the shell vs the build's capped 2.385-2.40 line).
- stations 52.2: tower slices i5/i6/i7 topPct 6.9/13.3/8.8 + i13 11.3
  (bow read — residual under investigation, ~2.4 pts) with the two
  mast slices i3/i8 (33.7/52.7) eaten by the trim. Widths ladder-clean:
  12 of 14 slices ≤1.5%, i6 2.14 (carrier-lap AA, razor class).
- hull rows are NOT capped and read 83.7/93.2/92.0 (side residual =
  the ref's 45° ramp-vs-arc wrap shading class + one ONLY-REF thin jaw
  col at z 3.476 = the dims-100 trade, cover 0.81).
Post-warp expectation: whole/turret/station rows release toward the
90 ladder like t90m batch-23 (its 64.7 -> 90.7 arc).

### Law notes for the bank (this round's finds)
1. **UNNAMED-BUCKET SHADOW LEAK**: /shadow/i mask exclusion keys on
   MESH names, but merged bucket meshes ship UNNAMED — hullShadow
   content IS read by the gate masks. The full-length sponson-relief
   strip (x ±1.606, top 1.645) owned every bow silhouette column above
   the 1.49 platform (+0.13 × 9 cols on side_hull) until shortened to
   the deck-covered band. Attribution probe: tools/tmp-amx40-whatsat.*
   (raycast top-attribution, diagnosis-only).
2. **STATION SEGMENTATION PITCH**: ≤0.48m butted segments (strictly
   under the 0.52 slab) guarantee an end-cap in every station window —
   uniform-pitch loops beat hand-placed joints (three of my hand joints
   missed windows by 1-9mm). 4mm laps kill z-fighting.
3. **CARRIER-LAP AA**: a segment lap protruding 1mm into a station
   window still lights it (partial-pixel law) — segment ENDS need the
   same ≥2px margins as faces.
4. **REAR-KIT UNION vs the 12% FILTER**: rear-plate furniture unions
   (grille+lights 0.50 band) hand hullLengthM whole extra columns even
   when each piece is thin — flush-mount to a pulled-back plate
   (-3.380 face, kit proud only to -3.395) so the kit never extends
   the plate's own mask signal.
5. **RAMP-ANGLE IDENTITY**: the print's 45° approach/departure ramps
   need BIG HIGH end drums (y 0.67-0.70, outer r ~0.35-0.41); small
   raised drums leave the free-tangent ramp shallow (+0.2-0.35 err on
   8 wrap columns). §B4 crest check: drum crest + band + 0.085 shoe
   radial vs the sponson floor (1.9cm dip = 32 voxels at --exact).

### Honest residuals / next arc
1. THE WARP: knee-2.39 normalize plan (above) — orchestrator §E lane;
   post-warp re-extract + re-anchor before any column chase (banked
   spz_puma law note 2).
2. stations i13 (11.3%) bow-top read unexplained after the shadow-strip
   fix (my platform 1.49-1.51 vs ref 1.525 should read ~1.5%) — probe
   with the station-slab replica in the next arc.
3. plan_turret 76.3: sleeve columns x ±0.156 (ref's flattened sleeve
   exits at 3.73 vs my elliptical 0.8-scale — could tighten to match),
   left-wing/mantlet steps within ~0.2.
4. Turret-parent yaw-90 evidence pair (adjudication is analytic this
   round; render the pair at the critic round's hash).
5. Icons = orchestrator lane (genIcons --tanks amx40).
6. tools/tmp-amx40-whatsat.{html,mjs} = diagnosis probes, delete or
   keep per round-close convention.

## r2 OWNER-SOURCE COMPLETION (§5.93, 2026-08-10) — SUPERSEDES r1

The owner ordered the raw AMX-40 to be finished from the quarantined model
with the Leclerc comparison standard. The playable remains fully procedural;
the reference GLB is measurement-only and stays ignored. The repaired working
oracle SHA-256 is
`570a12b0ced56299061fc0a57c3f86343d2aa45e2fb79d53e049f58da2e9849d`;
the pristine pre-bake `.bak` is
`2a510ae66a2355bc9766f043c7f42ae51164181ac9a6ed40d45c63993789d50e`.
The final vertex receipt measures 160,559 vertices / 142,137 triangles,
body 2.615 m × 6.811 m, hull mask 6.868 m, overall 10.05 m and width 3.36 m
against the filed 2.62 / 6.80 / 10.04 / 3.36 m envelope.

### Final authored repair

- Hull belly, bow knee, underbite, rear step and full skirt course were
  re-traced from the source silhouettes. The native six-road-wheel course
  uses source-measured non-circular front/rear wraps through the shared game
  track system; donor track and donor wheels are never rendered.
- The rear belly shoulder now stops at z -2.65 ahead of the sprocket wrap and
  the undercut narrows to ±0.90. This is a real clearance channel, not an
  audit exemption: exact band containment is 26/48 voxels and shoe
  containment is 26/16, all below the 60-voxel law with no blind spot.
- The low asymmetric welded turret was rebuilt as one continuous shell. The
  right wing drops toward the source shoulder; the flank modules use
  asymmetric inward-high/outward-low crowns. Their lid seams follow those
  crowns instead of crossing above them as detached flat strips.
- Roof furniture is seated through explicit crown courses, optic bridges,
  cupola hinge, sight bases, MG pedestal and antenna pots. Smoke banks,
  cupola, sights, MG and masts remain turret-owned. No decoration depends on
  world-space placement.
- The mantlet, LLLTV saddle, 20 mm coax and CN120-25 were re-proportioned from
  source masks. The gun retains its source-correct no-evacuator thermal
  sleeves and a modeled bore; the final muzzle fixes the 10.04 m overall
  datum.
- `buildRunningGear` gained an optional `loopPoints` centerline. Undefined is
  the historical byte-identical path for all existing vehicles; AMX-40 alone
  uses it to retain the common animated band, linked shoes, guide horns,
  spinner and damage system while matching the source wrap.

### Registration adjudication — FALSE-0 / rejected pose experiment

The source extractor reports an internal raw orientation disagreement:
`glacisSign -1`, `gunSign +1`, while the registered visual harness and every
paired camera show the complete source and procedural vehicles facing the
same direction. Applying an extra yaw/rest-pose correction to that diagnostic
cratered the gate to a false zero by rotating an already registered oracle.
That experiment is rejected and not present in final code. Authoritative
registration remains `yawOffset 0`, `flip false`, auto-pivot true; the source
file's internal hull/turret interpenetration is likewise oracle evidence, not
playable geometry.

### Final receipts

- Clean geometry gate SHA-256
  `bc02bdb21b99b004e847dbd5c153f1633957c6d5aeaa41aeb668a6e4ceb103b9`:
  **90.1** | hull 90.2 / whole 90.5 / turret 90.1 / stations 91.8 /
  dimensions 93.4 / floaters 100. A second clean run reproduced the row.
- Direct fidelity: **94.7** overall; H96.4 / T90.9 / G92.1 / R95.9;
  required-view floor 95.57. Standard check: gate PASS, exact band clip
  26/48 and shoe clip 26/16 (all below the 60-voxel law), no shoe blind
  spot, contiguity 0, decoration census mg1+7d.
- Winding mode 1 is clean (0 reversed / 0 mixed; 11 px or 0.01% maximum
  FrontSide deficit). Mode 2 reports zero yaw-stranded candidates. The
  turret-parent audit's three coarse stranded candidates are the intended
  hull-owned spare-link/cable/deck-furniture class; the yaw sitting confirms
  that they remain with the hull while all turret equipment rotates.
- Deterministic freeze: **`d2c73d96`**, 58 meshes / 83,226 vertices,
  reproduced byte-for-byte twice.
- Independent §B8 passes all fourteen frozen-byte views at floor **9.0**,
  mean **9.06**. Fresh yaw 0/90 confirms one continuously seated turret,
  gun/mantlet, cupola/optics, smoke/flank/service kit and bases; no fixed
  duplicate turret mass, unsupported decoration or air seam. The native
  six-wheel linked-shoe system passes with distinct terminals, continuous
  contact/wrap courses and no donor gear. Verdict:
  `docs/critique/shaded-parity-amx40-source-graduation.md`.
- The former pre-warp ceiling, old source-height interpretation and r1
  freeze are retained above only as an audit trail; they are not current
  constraints or queue items.
