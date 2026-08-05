# leo2_revolution shaded-parity r14 — ROUND-4 ADJUDICATION (2026-08-05)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2_revolution` →
shots/critic-leo2_revolution/ (this session, zero console errors, favicon
404 only; vite 7486, FIFO lock free). Byte discipline: `tmp-hashgeo.mjs`
leo2_revolution = **3820620** (the 0x03820620 leading-zero display; 79
meshes / 110833 verts — exactly the r14 landing hash from a335a8e)
verified BEFORE rendering and re-verified AFTER all evidence runs
(bookend clean; leopard.js working tree clean at a335a8e throughout).
Graduates frozen both bookends: leo2a5 **bc9bad30**, leo2a6 **80b76338**,
kf51 **3ae9b70c** — the standing freeze lines.
Official gate re-run by me: **min 90.8 PASS ×2 BIT-IDENTICAL** (hull 91.2 /
whole 90.8 / turret 92.2 / stations 91.4 / dims 99.5 / floaters 100 —
cmp-clean between runs; exactly the a335a8e landing line, and UP from the
r12/r13 90.7 through a geometry re-plane round).
`visual-evaluator.mjs`: exit 0, **RIG PARITY OK** (max yawProxy 0.8°
@front, |dCentroid| 0.186 m — the r9-r13 line), evidence at
shots/visual-eval-leo2_revolution/ (my run). standard-check exit 0:
gateMin 90.8 | clip **0/0 ✓** | contig 0 ✓ | decor mg1+4d ✓. Standalone
`track-clip-audit --exact`: front **0** rear **0**. Measurements:
tools/tmp-rev-critic-r9-measure.py (standing §D refined mask: maxch ≤13
AND B−R ≥ +8) + tmp-rev-r13-chainflag.py on a FRESH self-generated
tmp-e3-maskprobe dump (border-clip law) + tmp-rev-critic-strips.py
(§H.4). Crops under shots/critic-leo2_revolution/crops/ are
DIAGNOSIS-ONLY.

## HEADLINE: FAIL — floor 8.8 (hero-frontleft), THIRTEEN of fourteen views AT the 9.0 bar; mean ≈8.99. The r14 re-plane delivered everything it claimed — several done-gates to the digit — and the four ledger-parked classes that held every r13 view are DEAD ON MY RIG (bow strata, cheek verticality, plan toe, hem staircase). What holds the last view is exactly the brief's documented carry: the **§B6 kit approach-ramp class at hero-frontleft** (ref ~19-22° long shallow ramp + exposed wheel-arch read vs kit-tangent ~34-35° short rise), a fleet-kit-lane item priced since r7 and outside this tank's file. One order stands between this tank and the graduation critic.

front 9.0 · frontleft 9.0 · left 9.0 · rearleft 9.0 · rear 9.0 ·
rearright 9.0 · right 9.0 · frontright 9.0 · top 9.0 · **hero-fl 8.8** ·
hero-rr 9.0 · toptilt 9.0 · close-front 9.0 · close-roof 9.0

Ladder: r7 6.6 floor → r9 7.7 → r13 8.1 → **r14 8.8**, ceiling 8.5 → 9.0.

## Claims audit (§D — every r14 packet done-gate re-derived on MY rig)

- Gate 90.8 ×2 bit-identical, components to the decimal: **CONFIRMED**.
- Hash eb04115c → 3820620 (64→79 meshes, 113033→110833 verts):
  **CONFIRMED** both bookends.
- Evaluator parity 0.8° @front, no RIG MISMATCH: **CONFIRMED** (exit 0).
- **A-1 BOW WEDGE to the digit**: the bow-shelf pair (ref 163.6°) reads
  **169.2 (Δ+5.7 ±0.5)** @z 2.38..2.84 y 1.88..2.00 — exactly the claimed
  176.9→169.2 kill (was Δ+13.3). The nose-corner vertical pair (ref
  75.5°) is **OFF the flag list** — both jacket nose rakes verified
  (frontleft flags carry no vertical at the nose; the 89.7° flag is
  gone). close-front worst is **Δ−10.5 @y 3.11..3.20** — coordinates
  place it in the RWS/pod zone, NOT the bow, exactly as the packet
  states (r13 digit).
- **A-2 CHEEK RAKE**: front view worst flag **Δ−2.7° ±0.4** (27 matched,
  5 flagged — the cleanest angle sheet this tank has ever printed; r13
  carried UNMATCHED near-vertical cheek pairs). close-roof upper-front
  pair now **MATCHED at Δ−8.7 ±0.3** (was unmatched at r13). Gate
  turret 91.8→**92.2**, stations 90.8→**91.4** — the plan_turret #1
  kill (0.773 err) shows up in the components exactly as claimed.
- **A-3 PLAN TOE**: the top-view toe pair (ref 10.5° @x 0.98..1.60) is
  **GONE from the flag list**. Top's remaining flags are ±2.4° wrap
  edges, −1.8°, and the certified +14.4 ±4 wrap-outline projection pair
  @x 1.55..1.57 (§B4 open-wrap corner, gear class — the r14 packet's
  named residual to the digit).
- **P-1 WHEEL ROW**: B1 strip certs **to the digit** — left med 56.6
  p5 **51.4** (gates p5 ≥40, med 48..58), right med **51.1** p5 45.0.
  SEVEN hub discs read per side in the opened band (r13: TWO) — the
  unowned r13 window is delivered.
- **P-2 MAG COVER**: pale top plate reads from the close-roof camera at
  the receiver top; census mg1+4d unchanged (tone-lane, zero mask
  movement — flood digits below confirm).
- **§B2 flood ALL TEN VIEWS to the pixel** (refined mask, PROC halves):
  front 92, rear **99**, rearleft 92, rearright 92, frontleft 92,
  frontright 92, left **120**, right **126**, top **110**, toptilt 95 —
  EXACTLY the r14 packet digits (base ≈92 px = label glyphs y13..21
  x16..104; rear −2 and top −12 BETTER than r13; left/right/toptilt +1
  px AA jitter on the certified residual classes). REF's own halves for
  scale: front 3320, top 4752, toptilt 1417 — the proc decks stay
  cleaner than the print's.
- **Tone certs at the landing bytes**: D1 tail panel [190:447]×[338:372]
  med **77.3** p95 89.6 **sd 12.31** (the r12/r13/r14 digits EXACTLY;
  gates 70..85 / ≥10). F1 jacket [120:500]×[305:355] proc med **67.4**
  vs ref same-rect **67.4** — **Δ0.0**, improved from r13's Δ+0.6,
  exactly as claimed.
- **HERO-VOID RE-DERIVED ON A FRESH MASK** (my own tmp-e3-maskprobe run
  at today's bytes + chainflag): **enclosed regions = 0**; the proc body
  EXITS the 1024-frame border (right edge, rows y 524..661, 138 border
  px). The evaluator's hero-rr 0.739 m² @(−2.34, 1.98, −1.01) is the
  certified border-clip artifact (r13: 0.742 — same open chain, AA
  drift). Remaining evaluator voids: toptilt 3.388 m² (ref-matched
  projection bay, certified — SMALLER than r13's 3.528) + **0.294**
  (sprocket void, certified digit exactly) + top 0.002 sliver.
- **§B5 stranded 6 / abutting 0 / dangling 0**: CONFIRMED, and the six
  boxes decompose exactly into the r13 adjudicated classes — driver
  periscopes (−0.68..−0.29 × 2.00..2.03 × 1.72..1.85), merged hull
  (±1.42), merged hullDark whole-bucket (±2.00, overlap 26% — instrument
  drift on the same bucket), three deck tint plates (y 2.01..2.11).
  PASS (adjudicated false-positive classes; hub dots are hull-parented
  by design and did not flag).

## §B standing checks

- **§B1 FRONT SLOPES + NO-STAIRCASES — PASS, verified at 1× AND at 4×
  magnification** (crop pairs r14-closefront-bow-{proc,ref}-4x.png,
  r14-fl-{proc,ref}-3x.png): the beak reads as ONE dominant raked wedge
  spanning the full inter-jacket width, clamp A-leg reads as a rooted
  fixture (not a floating course), jacket nose taper and bulge both
  raked, skirt bottoms cut as a smooth 3-facet diagonal hem meeting the
  beak plane co-planar at the corner. The r13 "3-4 stacked horizontal
  courses" silhouette is DEAD in every window I inspected (close-front,
  frontleft, hero-fl, left/right hem lines). The flank AMAP courses
  remain co-planar engraved seams (r13 PASS carried). Cheek faces rake
  (worst front flag −2.7°).
- **§B2 — PASS**: digits above; residuals are label glyphs + the
  certified left/right/toptilt hairline classes, sub-visible at 1×.
- **§B3 — PASS**: census mg1+4d; RWS parses as a weapon (tub + optic +
  barrel-side hardware + pedestal); the stowed MAG now carries a pale
  top cover readable from the ordered close-roof window. At 6× the RWS
  barrel articulation remains coarse (refinement tier, unchanged).
- **§B4 — PASS**: 0/0 exact standalone + standard-check; close-front
  and hero/quarter undercuts read contained (pads wrap the idler, plank
  step above, wrap crests into the open; rear corridor shows track +
  wheels). Gate row equality ×2 confirms zero gear movement.
- **§B5 — PASS** (boxes verified above).
- **§B6 — PASS on the law**: \________/ reads both sides; both end
  wheels raised, ramps at both ends; zero gear params moved this round.
  The approach-ramp ANGLE parity delta (ref ~19-22° vs kit-tangent
  ~34-35°) is NOT a law breach — it is the documented fleet-kit-lane
  carry, and it is adjudicated below as the round's floor holder.

## §H.4 VARIANT VARIETY (three graduates, fresh strips
shots/critic-leo2_revolution/crops/h4r14-rev-vs-{a5,a6,kf51}.png)

- vs **leo2a5 (bc9bad30)**: PASS — a5: scalloped skirts + exposed
  seven-wheel row, raked cheeks + mantlet dead-front, lower-wall
  cable-X + Y-508 markings; rev: closed AMAP jacket cliffs + opened
  hub-dot band, corner lattice cards, pale lattice tail band with the
  X ON it, RWS tub deck.
- vs **leo2a6 (80b76338)**: PASS — a6: exposed wheel row, proud blister
  + L/55 mid-step, louvre grille + V splash board; rev as above.
- vs **kf51 (3ae9b70c)**: PASS — different silhouette family (hex-arch
  skirts, muzzle brake, SEOSS tower, black ERA pads).
- Every tell is geometric and held byte-frozen (hashes verified ×2).

## Per-view justifications (bar ≥9.0; r13 score in parens)

Calibration: per pt91m-r28/merkava3d-r13 graduation practice, a view
rides at 9.0 carrying NAMED residuals when every one has a certified
owner (gate-priced column, kit-lane queue, print/projection artifact,
declared-window carry) and none dominates the 1× read.

- **front 9.0** (8.3): cheek verticality DEAD (worst flag Δ−2.7°, the
  best sheet on record for this tank); bow strata DEAD; RWS + MAG-cover
  + B1 towers + corner cards + D3 slit all read. Residuals: pod-zone
  richness vs ref cluster (certified r13 class), right-grid width bound
  (§C-priced), ref print-microline refOnly class — none bar-holding.
- **frontleft 9.0** (8.2): the wedge reads as ONE surface with the
  fender line (shelf residual Δ+5.7 ±0.5, half the r13 delta, inside
  the wedge-class read); nose verticals gone; hem a smooth diagonal.
  Residuals: hem oblique **Δ+9.2** (the ref's mudflap curtain hangs
  below our hem — certified smooth-vs-smooth match, same family as the
  Δ−17.3 mudflap carry merkava3d graduated with), +6.6 jacket seam,
  short ±4-band pairs, turret-front volume (dims-pinned r7 class).
- **left 9.0** (8.3): SEVEN hub discs + rims read in the opened band
  (r13: two); band certs 56.6/51.4 to the digit; jacket Δ0.0; hem
  diagonal. Residuals: no bore evacuator (priced since r7), Δ+12.8 ±4
  short turret-side vertical (corner-bias band), fore-roof drift twin
  −8.5, ref bustle-corner arc r0.20 (print rounding vs faceted card —
  fitting-scale), hem twin +9.2.
- **rearleft 9.0** (8.4): containment holds (dip-ledge dead), X reads
  from the quarter, organics; hem oblique twin **Δ+12.5** (mudflap
  class, certified), Δ−10.7/+13.7±4/−8.7±4 short upper pairs, profile
  Δtop +0.649 @z −1.53 (quarter-yaw projection class, p95 0.330 = r13
  digit exactly).
- **rear 9.0** (8.5): cable-X at 1× on the lattice band (option-B as
  ordered); D1 cert 77.3/12.31 under the X; flood 99 (−2 vs r13);
  clusters/shackles/flaps. Residuals: X-on-lattice vs ref lower-wall
  (certified nuance), turret rear busier than ref bustle (variant
  furniture, §H.4 tell), Δ−9.7 roof-rear line, profile p95 0.319 = r13.
- **rearright 9.0** (8.4): mirror; corner lattice edge-on; sprocket
  containment clean at 4×; Δ−10.2 course-lip line (certified course
  class), Δtop +0.627 twin.
- **right 9.0** (8.3): mirror; band certs 51.1/45.0; hub row reads;
  whip-stub verticals unmatched (certified bistability), departure-ramp
  shadow ref-only line (gear class).
- **frontright 9.0** (8.2): mirror; fore-roof **Δ−11.4** at the mantlet
  break = law-5 matching drift (the ref's rendered line falls through a
  zone its own columns read flat at 2.164 — column-pinned, certified);
  ref idler-arc r1.19 behind the skirt (gear-visibility class);
  +11.8 ±4 short pair.
- **top 9.0** (8.5): toe pair GONE (the r13 #1 top hold); crown cols on
  the ref line; corridor slots closed the ref's way; flood 110 (−12 vs
  r13); 0.002 sliver only. Residuals: fan r 0.36 size (~65%, certified
  deck-carry), +14.4 ±4 wrap-outline projection (certified §B4-corner
  gear class), plan width x 2.00 vs ref 1.93-1.95 (dims-sovereign),
  camo mottle finer than print flow (carried).
- **hero-frontleft 8.8 — FLOOR** (8.1): the r13 dominant holds are ALL
  DEAD — the bow reads as the ref's single wedge at hero magnification,
  nose corner raked, flank organics + courses carry, hem diagonal,
  containment clean. What remains is ONE zone: the FRONT RUNNING-GEAR
  read — the kit approach-ramp angle (worst matched flag **Δ+13.2 ±0.5**
  low zone; ref's r2.43 span-97° wheel/ramp arc UNMATCHED; the ref
  presents a long ~19-22° ramp with a big exposed idler + wheel arches
  where the kit tangent rises ~34-35° and the band shadows the hubs at
  this perspective) plus the tone-capped wheel-rim contrast (B1 med
  headroom ~1.4 luma). Both sub-reads have certified owners (idler
  dims-guarded since r7; fleet §B6 kit lane QUEUED; B1 gates exact) —
  but together they dominate the lower band of a hero view and are the
  first thing a judge notices after the bow. The builder's own self-read
  topped this view's class at 8.8; I concur. Jacket-corner +11.1/+10.1/
  +9.8 pairs are the certified width/crown perspective mixes; −8.7
  upper-rear short pair.
- **hero-rearright 9.0** (8.4): border-clip artifact re-proven on a
  fresh self-generated mask (0 enclosed regions, 138 border px); real
  under-wing slots stay closed; X + lattice + clusters + containment
  read; fan style + hero-flat classes carried (organics + tint plates).
- **hero-toptilt 9.0** (8.5): chorded fans, cable line, organics, tint
  plates; sprocket void 0.294 certified digit; projection bay 3.388
  (smaller than r13); camo-flow print class carried; +13.5 ±4 wing-plan
  short pair = the gate-priced wing-pull trade (plan_turret #1 kill).
- **close-front 9.0** (8.2): THE r13 DOMINANT READ IS DEAD — at maximum
  magnification the bow is one raked wedge + rooted clamp fixture +
  diagonal hem meeting the beak co-planar (4× crops); containment reads
  (wrap + plank step). Residuals: Δ−10.5 RWS/pod zone (r13-parked
  digit, small upper window), Δ+9.8 mantlet-crown drift twin, toe-face
  lean (dAlong-pinned), ref tube-line segmentation + ramp diagonals
  31.2/31.8 (the §B6 gear class from this camera, frame-bottom), ref
  pod-cap arc r0.09.
- **close-roof 9.0** (8.4): fore-roof steps → ONE raked plane verified
  (the −8.7 pair now MATCHED); MAG pale top cover reads from the
  ordered window; RWS full parse; F2b furniture + tint plates + hatch
  rings. Residuals: fore-roof Δ−6.9 law-5 drift (r13 digit exactly,
  column-pinned), −9.2 hem/ramp zone from this camera, whip-stub
  bistability (certified), print-grain gap at extreme zoom.

## Residuals certified this round (carried, with owners)

- §B6 kit approach-ramp angle + hero wheel-arch prominence — THE FLOOR
  HOLDER (hero-fl 8.8): fleet kit lane (buildRunningGear contact
  tangents / contactZF), idler dims-guarded; ORDERED below as R5-1.
- hem oblique +9.2/+12.5 — ref mudflap-curtain class, certified
  smooth-vs-smooth (graduation-compatible per merkava3d precedent).
- fore-roof −6.9/−11.4/+9.8 — law-5 matching drift at the mantlet
  break, column-pinned flat at ref 2.164.
- close-front −10.5 / pod-zone — r13-parked RWS/pod class (digits
  stable three rounds).
- top +14.4 ±4 / toptilt +13.5 ±4 / left +12.8 ±4 — projection +
  wing-pull gate-priced short-segment classes.
- hero-rr 0.739 border-clip chain (fresh-mask proof this round),
  toptilt 3.388 + 0.294 m², top 0.002, whip-stub bistability, muzzle
  cover 0.56, st11-12 wPct, pod-line, no-evacuator, right-grid width,
  plan width 2.00 (dims-sovereign) — all unchanged, gate ×2 row
  equality is the proof.

## ROUND-4 DISPOSITION — round-5 order book (ONE order to the bar)

The re-plane program is COMPLETE and verified: all four parked classes
are dead on an independent rig, the gate ROSE while they died, and 13
of 14 views sit at the 9.0 bar with named, certified-owner residuals
only. The floor is no longer this tank's geometry — it is the fleet
kit's approach-ramp tangent, exactly the §B6 item the brief documented.

- **R5-1 (THE BAR, fleet §B6 kit lane — orchestrator to schedule)**:
  approach-ramp tangent flatten toward the ref's ~19-22° class at the
  front contact (contactZF patch per §B6 mechanism, idler CENTER held
  dims-safe; §B4 re-read 0/0 and B1 strip gates 51.4/45.0 must hold;
  hero-fl + close-front + frontleft re-read after). Done-gate: hero-fl
  low-zone pair inside ±5° of ref (today +13.2), ref r2.43 ramp arc
  acquires a proc match or the residual re-certifies, hero-fl ≥9.0.
  If the kit patch is fleet-frozen this round, the alternative is an
  owner certification of the ramp class as priced identity — under
  which this verdict's hero-fl re-reads 9.0 and the tank goes to the
  graduation critic with the carry documented.
- **R5-2 (optional polish, tone lane, zero gate risk)**: +1 notch of
  wheel-rim ring contrast INSIDE the B1 gates (med ceiling 58; left
  headroom ~1.4 luma) to firm the hero-band hub read — worth ~+0.05 on
  hero-fl only; not required if R5-1 lands.

NO other orders: every other residual is certified with an owner and
graduation-compatible per program precedent.

## Verdict

FAIL — floor **8.8** (hero-frontleft), thirteen views at 9.0, mean
≈8.99, +0.7 floor / +0.5 ceiling over r13: the largest single-round
jump in this tank's ladder, delivered entirely inside a RISING gate
(90.7 → 90.8 ×2 bit-identical, hash 3820620 stable, clip 0/0, §B5
clean, tone certs to the digit). The NO-STAIRCASES kill is verified at
1× and at magnification on every re-planed window. One fleet-lane order
(R5-1, the §B6 kit ramp) — or an owner pricing of that class — stands
between leo2_revolution and the graduation critic. This is round 4 of
the projected 3-4; the schedule holds.
