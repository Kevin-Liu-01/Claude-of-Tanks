# t84 SEAT RE-CERT (batch-40 graduate-change) — independent critic verdict
# (2026-08-04, on the coupled oracle+proc turret-seat change, pre-landing)

Scope: GEOMETRY-GATE.md §10 / BUILD-STANDARD §B5/§H3 graduate-change
re-cert for the batch-40 compound turret seat (oracle y_map + Turret
translate −5.2029u) + the r33 proc re-seat of buildT84. Prior graduate:
531fe4f0 @ critic 9.14 mean / floor 9.0 (shaded-parity-t84-r32.md).
Owner report under adjudication: "turret elevated too far away from the
hull … an issue with the base model."

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=t84` →
shots/critic-t84/ (21:03, zero console errors), PIXEL-IDENTICAL to the
builder's r33 seat archives (shots/russia-t84-seat/after-*: 0px>2 diff
on every checked view — deterministic rig, no drift between the r33
evidence and my watch). Byte-discipline: `tmp-t84-hashgeo74.mjs` t84 =
**fd0bca6c** (47 meshes / 93220 verts) at BOTH ends of my campaign — the
r33 packet hash exactly. Graduates byte-frozen at open AND close: pt91m
**e6994e54** ✓ / t72b3m **3d92bb98** ✓. Official gate on my watch:
**min 92.5 PASS ×2 bit-identical** (hull 92.5 / whole 93.2 / turret 93.2
/ stations 96.1 / dims 99.1 grace / floaters 100; gatePassed:true
re-read from JSON both runs; ledger row matches) — +2.3 over the 90.2
graduation record with EVERY component at or above it.
`visual-evaluator.mjs --id=t84`: exit 0, **RIG PARITY OK** (max
dYawProxy 1.0° @close-roof, all others ≤0.8°, no flips), evidence
shots/visual-eval-t84/. Measurements: my own sweeps on MY fresh pairs
(tools/tmp-t84-seatrecert-measure.py — ITU-601 luma rects, mask-method
bg |px−0x151b20| maxch ≤13, 8-conn border-flood, ≥12px clusters,
label-text excluded, PLUS the blue-signature term B−R ≥ +8 per §D);
2-3x crops diagnosis-only (scratchpad). Machine audits re-run:
track-clip-audit --exact **4/0**, tank-standard-check **PASS** (clip ✓
holes 0 ✓ mg1+6d ✓), turret-parent-audit **stranded 1 / abutting 0 /
dangling 0**. Pair frame: REF x [0,640), PROC x [640,1280).

## HEADLINE: RE-CERT PASS — floor 9.0 (hero-rearright, close-front),
## mean 9.15; every view at or above the 9.0 bar. The owner's seat
## defect is CLOSED, measured. Recommend re-freeze 531fe4f0 →
## **fd0bca6c** in the one coupled landing (§10 paperwork + turntable
## eyeball owed at the commit, per the graduation flow).

front 9.2 · frontleft 9.2 · left 9.3 · rearleft 9.1 · rear 9.1 ·
rearright 9.1 · right 9.2 · frontright 9.2 · top 9.2 · hero-fl 9.2 ·
hero-rr 9.0 · toptilt 9.2 · close-front 9.0 · close-roof 9.1

## THE SEAT READ (owner report — adjudicated with instruments)

Per-column DAYLIGHT scan (sky px between casting underside and the next
mass below, band y268..306, casting-footprint columns; view-left/right):

| state | cols w/ daylight | mean | max |
|---|---|---|---|
| BEFORE archive (graduate 531fe4f0) | 142/207 (69%) | 9.68px | 24px |
| MY FRESH PROC left (fd0bca6c) | 62/165 (38%) | 1.60px | 12px |
| MY FRESH PROC right | 62/165 (38%) | 1.90px | 12px |
| the REF's own left read | 65/161 (40%) | 2.35px | 19px |
| the REF's own right read | 67/161 (42%) | 2.59px | 17px |

- The ring/center zone reads **ZERO daylight on both sides** (left
  x850..950, right x968..1070): the casting sits INTO the deck at every
  ring column, like the warped print (rim 2.3 cm into the deck,
  probe-class). The owner's daylight band is GONE at every angle I
  rendered — view-left/right/front/rear, all four quarters, both heroes,
  both closes.
- The ONLY residual daylight columns are the REAR BUSTLE-OVERHANG groups
  (PROC x787..848 / x1071..1132), present in the REF at the SAME
  coordinates and LARGER (REF x148..211 / x428..491, its worst columns) —
  the family-normal 0.21 m bustle overhang over the engine hump, i.e.
  legitimate matched structure, not float. The proc now reads
  **better-seated than the reference itself**.
- Proportions (same instrument, REF vs PROC): deck line y298 == y298,
  roof y256/257 and y254 == 254, ground y386 == 386, casting visible
  height 42 vs 41px (left) and 44 == 44px (right); deck/top 0.677 vs
  0.682 left, 0.667 == 0.667 right EXACT. BEFORE read deck/top 0.626
  with a 49px "casting" that included the daylight band. The T-84
  deck-line / casting-height / roof-line proportions are ref-true.
- Pixel-identity: my fresh view-left/frontleft/close-front are 0px>2
  identical to shots/russia-t84-seat/after-* — the builder's before/after
  evidence is exactly reproducible on my watch.

## Standing checks (§B + §H.4)

- **CONTIGUITY / NO EMPTY AREAS (§B2): PASS, with the blue-signature
  decomposition** — border-flood enclosed-sky on MY 14 fresh pairs:
  **8/14 PROC views ZERO** (left, right, frontleft, frontright, top,
  hero-frontleft all clean — view-top's r32 14px sub-pixel seam family
  is GONE); residual mask-method total **2517px**, builder's r33 numbers
  reproduced EXACTLY per view (front 145 / rearleft 28 / rear 125 /
  rearright 32 / hero-rr 132 / toptilt 861 / close-roof 1194). The
  blue-signature term (B−R ≥ +8) splits it cleanly:
  - TRUE SKY **196px total** = the named KORD-BARREL SLITS (rear 121,
    rearleft 28, rearright 19, toptilt 28) — the enclosed pocket under
    the swung barrel between pintle, receiver and roof. Adjudicated at
    3x AND 1x: this is the standoff window a real pintle gun shows (the
    REF's own Kord carries LARGER open scissor-slits under its yoke);
    MG PHYSICS (§C) wants the sky-backed silhouette and prices it
    inside the pintle allowance. Certified decoration-lane residual,
    ≤0.04% of frame, invisible-as-defect at 1x. CONFIRMED as classed.
  - The remaining ~2321px scan as WARM NEAR-BLACK SHADE (blue 0):
    close-roof proxy-shadow band ON visible plates, toptilt grazing
    slots, view-front grazing rows, hero-rr gear shadow — rendering
    content at the mask's tolerance edge, not background. Same families
    at the same coordinates as the r32 graduation verdict (hero-rr 132
    BETTER than r32's 159).
  - NEW-CANYON LAW verified: the r33 seat-flip windows (view-left 573px
    / view-right 562px enclosed at the shoulder-to-bustle canyon) are
    **0 on my renders** — the carrier-planform plugs hold, and the
    canyon zone tone reads walled camo recess (see group-1 rects).
- **TRACK CONTAINMENT (§B4): PASS** — audit --exact **4/0** on my run
  (r32/r33-identical; the 4 is the bow-flap kissing the dilated wrap,
  no visual contact at 1x).
- **TURRET FURNITURE PARENTING (§B5): PASS by adjudication** — machine:
  stranded 1 / abutting 0 / dangling 0. The one strand is
  fitting_towCable(29%): the engine-deck tow cable recessed flush into
  rig_hull deck the bustle merely overhangs — the law's own
  stay-in-rig_hull case; AABB-coarse envelope smear, documented
  audit-artifact (the committed r32 graduate read stranded 1 +
  abutting 1 — this change CLEARS the abutting flag). Zero real
  strands, zero dangling. The yaw-90° rotating-furniture pair remains
  owed at the landing turntable per §B5.
- **TRACK RUN SILHOUETTE (§B6): PASS, measured** — view-left PROC
  ground run x774..1008, bow rise 5/13/36px (+12/+30/+60) vs REF
  6/16/37; stern rise 6/13 near-field (trapezoid, BOTH end wheels
  raised, no parallelogram); the +60px stern sample lands on the
  carried sprocket-wrap arc (11 vs 31px — the r31-certified
  arc-vs-straight-ramp class, gate-priced at 'at' 4.32 err 0.062 ×1).
  The seat map is identity below y 0.992, and the run measures
  unchanged from graduation class.
- **FRONT SLOPES (§B1): PASS** — no long-edge glacis-class flag in any
  view; front flags are 0.09-0.27m step edges (half inside the ±4°
  corner-bias floor). The two PLANNED kink classes reproduce at the
  packet's own coordinates and magnitudes, per §D:
  - dome-slope: left Δ-9.4° ±0.6 on a 0.41m upper edge @ world
    y 1.863 z 0.371 (the z1/z2 stretch kink on the cheek ramp) — the
    plan's risk-3 lane, family-correct look (t80 casting class);
    plus left Δ-9.7° ±0.7 on a 0.40m stern edge @ y 1.358 z -4.613
    (stern-deck step, carried).
  - close-front root-depth: Δ-10.3° ±0.5 on the 0.58m lower-left toe
    lane @ y 0.19 z 1.508 (bow flap course) — r33-packet-identical.
  Both short-edge step classes, neither a §B1 rake violation.
- **DECORATION / MG PHYSICS (§B3/§C): PASS** — census mg1+6d ✓. Kord
  reads gun-with-receiver+cradle+pintle at close-roof 2x (dark
  crown-riding mass per pale-deck inversion); cupola drum + vision
  blocks + recessed hatch read dimensional; rack bins/towCable/spare
  links/K-5 rows all present. The slate-blue optic faces are
  PRE-EXISTING graduate dressing (before 28px / after 77px at the same
  cell in close-front — the seat changed the presentation angle only)
  and appear on the t80/t80b siblings too — family treatment, accent
  note only.
- **VARIANT-DISTINCTIVENESS (§H.4): PASS** — fresh same-rig strips
  (t84/t80/t80b PROC halves; left/front/close-roof): t84's deep skirt
  curtain + LONG WELDED FLAT-FACE casting with two-block roof cluster +
  cupola drum + right-flank rack + K-5 glacis banding vs t80's exposed
  six-wheel row + cast rounded dome + '117' vs t80b's dome + cheek
  appliqués + '225'. The SEATED, TALLER casting walls make the welded
  read STRONGER than at graduation — no re-badge read at any angle.
  The seat did not dilute a single tell.

## r33 builder-claims audit (§D; on MY fresh pairs)

1. "gate 92.5 PASS ×2, components 92.5/93.2/93.2/96.1/99.1/100":
   CONFIRMED ×2 bit-identical, JSON + ledger match.
2. "hash 531fe4f0 → fd0bca6c (47/93220); graduates frozen": CONFIRMED
   at both ends of my watch.
3. "flood census view-left 573→0, view-right 562→0, TOTAL 2517": ALL
   CONFIRMED to the pixel, same per-view split, same cluster coords.
4. "Kord slit class rear 125 / rearleft 28 / rearright 32": CONFIRMED,
   and my blue-signature instrument proves they are the ONLY true-sky
   residual (196px total; everything else warm shade).
5. "clip 4/0, holes 0, mg1+6d, parity 1.0° @close-roof, stranded 1
   towCable artifact": ALL CONFIRMED on my runs.
6. "named kinks: left dome Δ-9.4±0.6, close-front Δ-10.3±0.5":
   CONFIRMED at the same coordinates/magnitudes on my evaluator run.
7. Seat archives before/after: CONFIRMED pixel-identical to my fresh
   renders (after) and to the measured daylight table (before).
   The one style nit: the packet's §B2 residual list omits that
   view-top now scans CLEAN (an improvement over r32 it didn't claim).

## The scores (bar: ≥9.0 "same vehicle, same tier"; prior 9.14 mean)

- **view-front 9.2** — casting cheeks now reach the deck; K-5/pods/lit
  tracks carried from r32; 145px non-blue grazing rows only. Holds
  back: track-face glint gap, cheek-stack plate read at the face.
- **view-frontleft 9.2** — clean §B2; one camo mass; seat contact
  reads correct at quarter angle; bustle roofline short-edge flags
  carried.
- **view-left 9.3** — THE OWNER VIEW, transformed: ring daylight ZERO
  (was 69% of casting columns at mean 9.7px), canyon window plugged
  (573→0), proportions REF-exact, tone bands in class. The 0.41m
  dome-ramp kink and hem pale-reach cap are the honest remainder.
  Strictly better than its 9.2 graduation self.
- **view-rearleft 9.1** — seated; stern gear lit; 28px true-sky Kord
  slit (certified class); rail-vs-raked-stern short edges carried.
- **view-rear 9.1** — collar camo AT ref median (64.5 vs 64.2, sd
  12.0); Kord slit 125px reads as normal pintle standoff at 1x;
  pale-blotch mismatch (pale95 19 vs 820) carried fleet-class.
- **view-rearright 9.1** — mirror; rack recess tell reads; 32px slit.
- **view-right 9.2** — ring seated, canyon plugged (562→0), V1/V2
  stay dead, one camo mass to the hem; fleet pale-reach cap carried.
  Better than its 9.1 graduation self.
- **view-frontright 9.2** — clean §B2; pods/skirt/K-5; ochre box
  edge-on accent.
- **view-top 9.2** — footprint/registration near-perfect (plan rows
  y-immune by construction, verified clean); the r32 sub-pixel seam
  slit family GONE; plan ruler edges + sparser engine deck carried.
- **hero-frontleft 9.2** — seat junction clean at hero angle; deck
  busy; flap hardware tucked at 1x.
- **hero-rearright 9.0 — FLOOR** — evaluator's 1.483m² luma void
  cross-checked: ZERO enclosed sky in the canyon (bg census
  open-connected above the roofline; zone tone med 51.5 sd 12.4
  g−r +3.4 vs ref 59.8/10.4/+4.4 — walled camo recess). Holds AT the
  bar for the same reasons as graduation: kit-boxy welded roof cluster,
  shadow trench, ochre edge glow, 132px gear-family slivers (BETTER
  than r32's 159). Same vehicle, same tier, least margin.
- **hero-toptilt 9.2** — drum/gun/K-5/kit from the signature angle;
  861px grazing family non-blue shade, sub-noticeable at 1x.
- **close-front 9.0 — CO-FLOOR** — the root stage deepened to the deck
  reads REF-true (the planned look); K-5 rows and seam-ringed mantlet
  root read. The honest oddity remains and gained a stick: the
  outboard flap+bracket group now reads THREE dark descenders under
  the pod corner (two-course flap split + bracket pair; before: two) —
  same rubber/gunmetal top-attached class, ~4-6px wide each, priced
  at the r32 quarter-point exactly; toe-lane kink Δ-10.3° carried;
  blue optic face accent note.
- **close-roof 9.1** — cupola drum + blocks + Kord all read; roof
  plates split per the fresh ref lines; the 1194px proxy-shadow band
  is solid warm shade ON plates but keeps the roof's shadow language
  heavier than the ref's; ochre box saturation loud.

Mean **9.15** (was 9.14 at graduation) — the seat round bought back
more than its furniture tax.

## Residuals carried (certified/priced; no orders)

- Kord-barrel true-sky slits (196px across four views) — MG-physics
  pintle silhouette class, §C allowance, named + crop-evidenced.
- Non-blue shade families (close-roof band, toptilt/front grazing,
  hero-rr gear) — tone-lane polish candidates only; all render as
  content (blue-signature 0), pre-existing classes.
- Rear bustle-overhang daylight columns — REF-matched structure (the
  REF's own read is larger); family-normal 0.21 m overhang.
- Dome-ramp kink (left Δ-9.4±0.6 / 0.41m) + close-front toe kink
  (Δ-10.3±0.5 / 0.58m) — the plan's named risk-3 classes,
  family-correct per the t80 casting proportions; watch only if a
  future round re-authors the cheek.
- close-front flap descender trio (quarter-point, priced into the
  9.0); sprocket-wrap far-field arc; plan ruler edges; sparse engine
  deck; ochre/slate accents (cosmetic notes); dims heightM 2.24 grace
  / hullLength 7.00 quantized — all landed/certified classes.

## Verdict

RE-CERT **PASS** — floor 9.0 (hero-rearright, close-front), ceiling
9.3 (view-left), mean 9.15; every view ≥9.0 with the geometry gate at
92.5 PASS ×2 (every component ≥ the graduation record). The owner's
turret-float defect is closed and instrumented: ring daylight zero at
every angle, the proc better-seated than its own reference, proportions
ref-exact, and nothing the seat touched regressed — §B2/§B4/§B5/§B6/
§B1/§B3/§H.4 all hold on the official rigs with the r33 builder's
claims reproduced to the pixel. t84 meets the critic half of the §G
dual gate at hash **fd0bca6c**: recommend the orchestrator LAND the
coupled batch-40 + re-seat commit with the re-freeze 531fe4f0 →
fd0bca6c, the §10 paperwork, and the turntable + yaw-90° furniture
eyeball at the commit. Any geometry edit invalidates this verdict.
