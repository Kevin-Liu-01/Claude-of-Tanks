# t84 shaded-parity r32 — RE-ADJUDICATION (2026-08-04, independent critic)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=t84` →
shots/critic-t84/ (11:24, zero console errors), PIXEL-IDENTICAL to the
committed r32 landing archives (shots/russia-r32/, 0px>2 diff on all 14
views — deterministic rig, no drift between landing f27feef and this
verdict). Byte-discipline: `tmp-hashgeo.mjs` t84 = **531fe4f0** (47
meshes / 84292 verts) at BOTH ends of my watch — the r32 landing hash
exactly. Graduates at open: pt91m **e6994e54** ✓ / t72b3m **c19ec9f0**
✓. At close: pt91m unchanged ✓; t72b3m read b043acd9 (+360 verts) —
the CONCURRENT t72b3m builder round's in-flight working-tree edits
(expected per this round's brief; t84/pt91m byte-stable throughout, so
NOT a STOP for this adjudication — the t72b3m lane owes its own freeze
proof at its landing). Sibling comparators t80 **48df8d48** / t80b **a7b648e1**; the
r32 commit's only shared-helper hunk (ruGlacisKit hookX/hookBucket) is
opt-in with byte-identical defaults and every other hunk is inside
buildT84, so the r31 critic's fresh 08:34 strips remain valid §H.4
comparators. Official gate re-run on my watch: **90.2 PASS ×2
bit-identical** (hull 92.0 / whole 92.3 / turret 90.2 / stations 95.3 /
dims 99.1 grace / floaters 100) — matches the f27feef landing line.
`visual-evaluator.mjs --id=t84`: exit 0, **RIG PARITY OK** (max
dYawProxy 1.8° @close-roof, all others ≤0.5°, no flips), evidence
shots/visual-eval-t84/. Measurements: my own sweeps on MY fresh pairs
(tools/tmp-t84-r32critic-measure.py — ITU-601 luma rects, mask-method
bg |px−0x151b20| maxch ≤13, 8-conn border-flood, ≥12px clusters,
label-text excluded); r31-archive comparison scans run on
shots/russia-r31/ for residual provenance; 3-5x crops diagnosis-only
(scratchpad). Machine audits re-run this round: track-clip-audit
--exact, tank-standard-check, turret-parent-audit (results below).
Pair frame: REF x [0,640), PROC x [640,1280), same camera.

## HEADLINE: PASS — floor 9.0 (hero-rearright, close-front), mean 9.14;
## every view at or above the 9.0 bar. GRADUATION TRACK (§G dual gate:
## geometry 90.2 PASS ×2 + this verdict; turntable eyeball owed at the
## graduation commit per GEOMETRY-GATE.md §10).

front 9.2 · frontleft 9.2 · left 9.2 · rearleft 9.1 · rear 9.1 ·
rearright 9.1 · right 9.1 · frontright 9.2 · top 9.2 · hero-fl 9.2 ·
hero-rr 9.0 · toptilt 9.2 · close-front 9.0 · close-roof 9.1

The r31 projection ("clear order 0 + groups 1-2 and the quarters jump
half a point; land group 3 and this is a genuine 9.0-track candidate")
is delivered and then some. Every one of the four §B2 void families is
dead on MY renders; the primer-gray family is scheme camo everywhere I
probed it; the gear band is lit to ref class; the roof carries a real
drum, a real gun and mark-appropriate kit. What remains between this
build and higher scores is fleet-material ceiling (pale-reach at hem
depth, track-face glint), a pair of cosmetic close-range oddities
(outboard flap sticks, roof seam emphasis), and gate-priced silhouette
residuals already carried in the packet (plan ruler edges, bustle
roofline flags). Nothing §B-blocking survives.

## Standing checks (§B + §H.4)

- **CONTIGUITY / NO EMPTY AREAS (§B2): PASS** — border-flood
  enclosed-sky scan on MY 14 fresh pairs: **10/14 PROC views ZERO**;
  residual **2182px across 4 views** (view-front 93, view-top 14,
  hero-rearright 159, hero-toptilt 813, close-roof 1103) — the
  builder's numbers reproduce exactly. All four r31 ordered families
  are dead in the views that carried them:
  - V1 slot lane: view-left/view-right PROC **clean** (r31 304/307px);
    close-roof slot-notch family (r31 x857..891/x837..866/x859..886,
    1079px) gone; turret band solid camo at 4x.
  - V2 under-skirt tunnel: view-right/view-frontright PROC **clean**
    (r31 1794/1463px) — two-course skirt reads as ONE camo mass to the
    hem; PROC sides now scan cleaner than the REF's own sanctioned
    wheel slots (REF left 289px / right 265px, its print permit).
  - V3 slat ladders: view-front/view-rear track windows **clean** (r31
    418/404px + ~10 rows/face) — front faces read as lit link ladders
    (med 56.0 vs REF 61.7, was 31.4; rear med 63.2 vs 61.7, AT ref).
  - V4 pod columns: view-front **clean** (r31 1212/1202px);
    close-front 170px window gone; trench close-out held (r31
    y444..450 pairs gone from view-front).
  Residual provenance proven against the r31 archives: every surviving
  cluster pre-exists r31 at the same coordinates (hero-rr 79px@x1158..
  1172 = r31's 78px; close-roof 269px@x1114..1162 = r31's 276px;
  hero-toptilt map near-identical 956→813px; none were ordered in
  r31), and nothing new appeared. THREE independent solidity
  instruments on MY renders:
  (1) EXACT-BG CENSUS (render truth): true pass-through renders the
  clear color exactly — I measured every residual cluster: **0 of
  2182px renders exact bg** (|px−0x151b20| maxch dev med 9-13, p90
  12-13 — ALL residual pixels are rendered content sitting at the
  mask's tolerance boundary: AA-blended seams, the proxy-shadow band,
  near-black gear — never open background).
  (2) VISUAL at 3-5x: the close-roof band is a soft-edged
  proxy-shadow ON a visible plate surface, the toptilt slivers are
  rail/deck-edge shadow slots, the view-front slivers are ≤3px-tall
  grazing rows.
  (3) RAYCAST (tools/tmp-t84-r32-probe DoubleSide re-test on my
  cluster coordinates, full coverage): ALL close-roof clusters
  including the 269px shadow band (rays sky=0, solid
  rig_turret/rig_hull hits), all three hero-toptilt strips, both
  hero-rearright clusters, and the view-front slivers probe SOLID —
  zero true-sky, zero culled faces. ONE finding — the view-top 14px
  sliver @x1048..1054 y102..103 threads TRUE-SKY rays on its upper
  row (7-9 rays, world x 1.574..1.681 z −3.848; the rest of its rect
  hits rig_hull): a sub-pixel plan slit (~0.11 × 0.02 m ≈ 1.2px wide
  at 59.8px/m) at the stern-right fender/deck seam, OVER THE TRACK
  RUN, outside the hull/turret interior the hole law names. Because
  it is sub-pixel-width it never renders as background (census (1):
  dev med 9 — an AA seam line); at 8x it reads as one panel seam
  among several, at 1x it is invisible, the ratified machine
  instrument (standard-check top-down enclosed cells) scores holes
  0, and the REF's own plan edge carries a serrated comb of larger
  bg notches 10px away. r31 precedent left this exact class
  (including a 20px cluster at these coordinates) unordered at 18x
  today's total. Carried as a NAMED sub-visible residual with the
  fix lane banked (2 cm seam backer at the stern fender corner,
  zero-silhouette), not order-scale. Everything order-scale is dead;
  no view renders open background through the vehicle; §B2
  satisfied. (Builder-claims note: the packet's blanket "residual
  ALL probe-verified solid" was accurate for 2168 of 2182px — the
  view-top sliver is the one probe-level miss, immaterial at render
  truth but corrected here for the record.)
- **TRACK CONTAINMENT (§B4): PASS** — audit **4/0** on my run (≤60
  band; was 18/0 in r31 — the unnamed sliver turned out to be the
  ruGlacisKit hook seat, now cleared by hookX 0.86; the remaining 4 is
  the bow flap kissing the dilated wrap, no visual contact at 1x).
- **TURRET FURNITURE PARENTING (§B5): PASS by adjudication** — machine
  prints stranded 2 / abutting 1 / dangling 0; both "stranded" are the
  documented AABB-coarse false-flag class (the kf51 note), adjudicated
  on the renders: (1) "(unnamed)" 62% is a full-width 5.4m deck slab
  (x ±1.41, y 1.02..1.35, z −3.70..1.74) — the raised deck itself, not
  furniture; (2) fitting_towCable 29% (z −3.79..−2.70) is recessed
  flush INTO the engine deck the bustle merely overhangs — the law's
  own stay-in-rig_hull case (turret-parenting it would dangle it
  mid-air on yaw). Abutting spareTrackLinks = deck gear, leave. Zero
  REAL strands, zero dangling; the yaw-90° turntable pair at the
  graduation commit is the standing §B5 eyeball for the instanced
  gear the audit skips.
- **TRACK RUN SILHOUETTE (§B6): PASS, measured** — view-left ground
  run x770..1012 with ramp rise 9/15/29px (bow +12/+30/+60px) and
  9/15/36px (stern) vs REF 9/17/32 and 9/18/45: the \\____/ trapezoid
  with BOTH end wheels raised; no parallelogram, no flat front. The
  shallower far-field stern rise is the carried sprocket-wrap
  arc-vs-ramp residual (−0.04 class ×3, gate-priced r31).
- **FRONT SLOPES (§B1): PASS** — evaluator front: 33 edges matched;
  every flag is short-edge class (worst real: Δ-4.9° ±0.4° on a 0.27m
  94° track-band vertical — the lane r31 cleared; the ±4.0°-noise
  0.10m micro-edges are within corner-bias floor). NO long-edge
  glacis flag in front or close-front (r31's 2.61m near-vertical and
  1.3m glacis lanes stay under 1.5°). close-front worst Δ-11.9° ±0.5°
  is the 0.58m toe edge (r31: -10.2° same edge — the bow-flap
  addition steepened the toe step, pod/flap class, not the rake). No
  flat-front violation.
- **DECORATION / MG PHYSICS (§B3/§C): PASS** — census mg1+**6d** ✓.
  Kord: receiver mass + cradle + pintle + ammo at close-roof 3x
  (dark crown-riding mass, pale-deck inversion per MG PHYSICS), reads
  gun-shaped from view-top (r31's 1px rod dead — root cause was the
  receiver hiding under the 2.205 plate line, fixed by mount 0.735).
  Cupola: raised drum, **round in plan** (lit rim arc at view-top 6x,
  no drawn-ellipse read), recessed hatch + vision blocks at
  close-roof. Deck kit: towCable recess, spareTrackLinks ×2,
  right-flank rack bins, seam lines, K-5 wedge rows on the glacis.
  Edge census (|∇L|>12, my rects): turret roof 2502 vs REF 2585
  (**0.97**, r31 class 0.60), engine deck 2186 vs 3167 (0.69, was
  0.49), glacis 2115 vs 2758 (0.77, was ~0.55).
- **VARIANT-DISTINCTIVENESS (§H.4): PASS** — same-rig strips vs the
  hash-stable siblings (t84/t80/t80b PROC halves, left/front/
  close-roof): t84's deep skirt curtain (wheels fully hidden) + long
  welded flat-face turret with two-block roof cluster + boxy fused
  evac + bow pods + K-5 glacis banding vs t80's exposed six-wheel row
  + cast dome + '117' vs t80b's dome + cheek appliqués + '225'. The
  r32 dressing (drum, Kord, rack bins, K-5) reinforced the tells
  rather than diluting them. No re-badge read at any of the three
  angles.
- FILL/CIRC: top-down decks filled (view-top 14px grazing sliver
  only); cupola circular in plan; wheels round where exposed.

## r32 builder-claims audit (§D; on MY fresh pairs)

Every checked claim reproduced exactly — this is the cleanest claims
sheet I have audited in this program:
1. "18112px/13 views → 2182px/4 views, 10/14 ZERO": CONFIRMED
   (2182px, same per-view split, same cluster coordinates).
2. "gate 90.2 PASS ×2 / hull 92.0 record / hash 531fe4f0": ALL
   CONFIRMED (×2 bit-identical on my runs; ledger row matches).
3. Group 1 gates — letterbox sd **11.3** g−r **+8** med 67.8 (gates
   ≥8 / ≥+5 / ref 66.8): CONFIRMED to the decimal. Collar med
   **62.2** sd **11.2** (gate 66.2±5 / ≥9): CONFIRMED — in-gate at
   the dark edge (ref pale blotch pale95 1322 vs 21 not matched;
   fleet-canvas class, see residuals).
4. Group 2 gates — left lower band sub-30 **0** (ref 0), track rows
   med **51.4** (gate ≥35), wheel-row p5 51.4 vs ref 51.7: ALL
   CONFIRMED. Honest misses re-measured and CONFIRMED AS REPORTED:
   pale≥95 1 vs 93 left / 0 vs 246 right; right skirt-band p75 63.4
   vs 79.5 my rect (builder 60.7 vs 73.0 on his).
5. "hero-rearright evaluator void 1.697m² is the r31 luma detector":
   CONFIRMED — my evaluator prints it, my §B2 scan of that zone
   finds ZERO enclosed sky (bg census in the canyon rect is
   open-sky-connected above the roofline, not enclosed); canyon tone
   now camo-class (med 52.6 sd 13.6 g−r +3 vs ref 57.8/12.7/+2; r31
   was sd~5 g−r −1 gray).
6. "close-front under-pod bg −422 (gate +300)": CONFIRMED −422 exact.
7. "audit 4/0, holes 0, mg1+6d, parity 1.8°": CONFIRMED on my runs.
8. Banked law "fixed near-black gear scans as §B2 sky under ±13":
   VERIFIED in effect — pt91m padHex/chainHex/gearFloor recipe kills
   the venetian-blind scan while keeping gear dark; BANK IT.

## The scores (bar: ≥9.0 "same vehicle, same tier")

- **view-front 9.2** — all four r31 drivers dead (V3, V4, letterbox,
  black slabs). K-5 banded glacis, pods integrated, ribbed lit
  tracks. Holds 0.8 back: track faces flat vs the ref's print-baked
  camo glint (pale95 0 vs 839/520), 93px grazing slivers, cheek-stack
  plate read at the face.
- **view-frontleft 9.2** — one camo mass bow-to-hem; comb
  sub-visible at 1x. Carried: Δ+17.7° bustle/rack roofline flag (the
  r31 lane, gate-priced), hem pale-reach.
- **view-left 9.2** — V1 dead, sub-30 0 vs ref 0, track rows
  ref-class, collar camo. Carried: pale95 1 vs 93 (flatter lower
  third), plan-straight skirt line, gun-root step at 4x.
- **view-rearleft 9.1** — stern zone p5 **59.9 vs ref 60.9** (r31:
  3.0 — the black stack is gone), gear lit, exhaust shelf reads.
  Carried: Δ+8.2° rail-vs-raked-stern flag, plain mudflap bars,
  bustle boxiness at quarter angle.
- **view-rear 9.1** — collar in-gate camo, V3 rows dead (rear track
  med 63.2 AT ref 61.7), 39 edges matched (best of set). Carried:
  collar darker than ref's pale-blotched band (pale95 21 vs 1322),
  no track glint, flap-cliff Δbot 0.238 p95 (carried r31 class).
- **view-rearright 9.1** — mirror of rearleft; stowage recess reads
  as the variant tell; Δ-14.6° short-edge flag (same rail class).
- **view-right 9.1** — the r31 CO-FLOOR view: V2 tunnel and V1
  window both dead, sub-45 303 vs ref 174 (was 2092), skirt band one
  mass. Holds back: p75 63.4 vs 79.5 — the pale camo streaks stop
  above the hem (fleet-canvas cap, certified), so the lower third
  reads flatter than the ref's full-depth streaking.
- **view-frontright 9.2** — V2 continuation dead; pods/skirt/K-5 all
  read; tiny ammo-box sliver at the turret edge (accent note below).
- **view-top 9.2** — footprint/registration near-perfect, cupola
  round, Kord gun-shaped, deck kit at 0.97/0.69/0.77 edge ratios.
  Carried: plan ruler edges x ±1.78 (6.25/6.23m UNMATCHED, straight
  vs the ref's serrated skirt line — r31 carried, not ordered),
  engine deck still ~30% sparser than ref, boxy evac plan edges
  (certified law 8).
- **hero-frontleft 9.2** — pegs → tucked flap hardware (no floating
  gray sticks at 1x), V4 closed, deck busy, letterbox camo edge-on.
  Comb readable on the climbs at 3x only.
- **hero-rearright 9.0 — FLOOR** — the r31 co-floor transformed: the
  canyon is a walled camo recess (evaluator's 1.697m² is luma-only;
  zero enclosed sky), turret cluster unified under scheme camo, gear
  band lit, rack carries bins. AT the bar, not above: the welded
  roof cluster still reads kit-boxy at this angle (visible ledges at
  the bustle blocks, deep shadow trench pulling the eye, ochre
  ammo-box edge glowing inside the recess), and the 159px
  pre-existing sliver family sits low near the gear. Same vehicle,
  same tier — with the least margin of the fourteen.
- **hero-toptilt 9.2** — drum + gun + K-5 rows + kit from the
  signature angle; grazing sliver family (813px, pre-existing,
  shadow-slot read) sub-noticeable at 1x; CAD bevel lines on plate
  edges now camo-broken.
- **close-front 9.0 — CO-FLOOR** — K-5 wedge rows read at 3x ✓,
  mantlet root sleeved with seam rings ✓, V4/pegs dead ✓, ladder
  read gone ✓. The honest residual is honestly visible: the outboard
  flap+bracket pair hangs as two dark descenders under the pod
  corner (~4-5px × 30px at 1x, sky behind) where the ref shows one
  integrated wide flap — hardware-class now (rubber/gunmetal, top-
  attached), but an oddity a garage-zoom player can spot; the 0.58m
  toe edge also steepened Δ-10.2→-11.9° ±0.5° with the flap seat
  (pod/flap step class, not the rake). Builder's quarter-point class
  is priced exactly right: 9.25 − 0.25 = 9.0.
- **close-roof 9.1** — cupola drum + vision blocks + hatch ✓, Kord
  receiver/cradle/ammo ✓, pano block camo ✓, rack bins ✓. Holds
  back: the three parallel seam stripes + proxy-shadow band read
  stronger than the ref's soft plate seams (269px tolerance-dark
  band — solid, but the roof's shadow language is heavier than the
  ref's), cupola-zone sub-45 3758 vs 478 (dominated by that shadow
  family, not the drum), ochre ammo box saturation loud vs the
  scheme.

## Residuals carried (certified/priced; no orders)

- Fleet-material pale ceiling: hem-depth pale streaks (1/0 vs
  93/246) and track-face glint (0 vs 500-840) — camo canvas +
  bakeDirt gradient cap, not addressable from the profile; med/p5/sd
  all in class. Carried as certified fleet cap.
- Outboard flap sticks at close-front (quarter-point, priced into
  the 9.0) — geometry lanes to fully occlude them cost 1.3-3.1 hull
  pts (measured and reverted by the builder, §C stray-column law).
  OPTIONAL polish only if a zero-gate material/shortening lane
  exists.
- Close-roof seam/shadow emphasis + toptilt/hero-rr/front sliver
  families (2182px, ALL rendering as content — exact-bg census 0,
  pre-existing r31) — tone-lane polish candidates, not §B2 items.
  The view-top 14px sub-pixel seam slit is the one named geometry
  hairline (invisible at 1x; 2 cm seam backer lane banked for the
  next geometry round, if any).
- Plan ruler edges x ±1.78; bustle roofline Δ+17.7/+8.2/-14.6° short
  edges; flap-cliff Δbot profile class; boxy evac + plan edges
  (packet law 8); dims heightM 2.24 grace / hullLength 7.00
  quantized; 4-voxel flap-kiss — all carried as landed/certified.
- Ochre ammo-box accent (close-roof/top/hero-rr) — variant dressing
  liberty within §B3; a half-saturation would sit quieter in the
  scheme. Cosmetic note only.

## Verdict

PASS — floor 9.0 (hero-rearright, close-front), ceiling 9.2 (seven
views), mean 9.14. All four r31 §B2 void families are closed on my
renders, the residual 2182px all render as content (exact-bg census
0) and are provenance-proven pre-existing;
groups 1-4 delivered to their windows or honestly certified against
fleet caps; the six owner laws hold on the official rigs (gate 90.2
PASS ×2, clip 4/0, §B5 zero real strands with both machine flags
adjudicated to the documented deck false-flag class, standard-check
PASS holes-0 mg1+6d, §B6 trapezoid measured, §H.4 tells named). t84
meets the critic half of the §G dual
gate at hash **531fe4f0** — recommend GRADUATION per GEOMETRY-GATE.md
§10 in the same commit, with the turntable eyeball and the §10
paperwork owed at landing. Any geometry edit invalidates this verdict.
