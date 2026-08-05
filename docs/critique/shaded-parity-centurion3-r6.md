# centurion3 shaded-parity r6 — FIRST FORMAL ADJUDICATION (2026-08-05)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=centurion3` →
shots/critic-centurion3/ (zero console errors; vite :7465, FIFO queued
honestly behind the concurrent centurion5 critic — its render landed
10:19:42, mine 10:20). Byte-discipline: `tmp-hashgeo.mjs` centurion3 =
**caa2e91c** (39 meshes / 70004 verts) BEFORE and AFTER the full campaign
— no drift; family watch: centurion5 **bbcf7d80**, chieftain5 graduate
**5117b9a8** both verified EXACT. Official gate re-run: **91.1 PASS ×2
bit-identical** (hull 92.4 / whole 91.2 / turret 91.1 / stations 95.2 /
dims 100 / floaters 100) — the a20e801 trim-boundary amendment row
reproduced exactly; turret_side 91.1 is the razor (1.1 headroom), whole
91.2 close behind. `visual-evaluator.mjs --id=centurion3`: exit 0, **RIG
PARITY OK** (11 ortho views, max dYawProxy 1.1° @front, |dCentroid| ≤
0.057 m; world offset Δ(0, 0.023, 1.205) is registration data), evidence
at shots/visual-eval-centurion3/. Mid-round law carried: **§B1
SLOPE-MOTIVATES-THE-MASS** (owner directive, c1ad424, landed mid-campaign
— docs-only, hash unaffected) added to the standing checks and ordered
where it fails at 1×. All numbers below re-derived this round from MY
fresh pairs (ITU-601 luma windows + mask-method air with the
blue-signature term); zoom crops diagnosis-only (scratchpad scan-c3.py).

## HEADLINE: FAIL — floor 8.4 (view-rear), mean 8.53, no view at the 9.0 bar; zero mandatory machine-gate failures (all §B audits green)

front 8.5 · frontleft 8.6 · left 8.6 · rearleft 8.5 · rear 8.4 ·
rearright 8.5 · right 8.6 · frontright 8.6 · top 8.5 · hero-fl 8.6 ·
hero-rr 8.5 · toptilt 8.5 · close-front 8.5 · close-roof 8.5

This is centurion3's first independent verdict, straight off its 91.1
gate release. The geometry program did its job: registration, dims,
footprint, slopes and the mark's identity (short bustle, slim 20-pdr,
MAG, duffel row, left-lean rear) are all genuinely graduate-grade — no
view reads "wrong vehicle" and the machine gates are the cleanest I have
audited (clip 0/20 in-band, parent 0/0/0, contig 0, mg1). What holds
every view in the 8.4–8.6 band is MATERIAL/TONE, in two measured
class-level drivers (A: gear contrast, B: ink/camo overshoot + CAD
grammar) plus one priced geometry order (the stepped turret plan front).
The tier gap is almost entirely razor-safe lanes.

## Standing checks (§B + §H.4)

- **TRACK CONTAINMENT: PASS** — `track-clip-audit --exact`: **0 front /
  20 rear** voxels (rear rig_hull = the documented r6 sprocket-grazes-
  tail-rake-loft AABB class; kv2-graduate band ≤60). No tooth-over-plate
  at 4× in any pair.
- **CONTIGUITY / NO EMPTY AREAS: PASS** — machine contig **0**; decks
  read filled at top + toptilt; no see-through voids at 1× in 14/14.
  The evaluator's three proc enclosed-voids (hero-rr 0.029 m² @x −0.64
  y 2.49 z 1.00; close-roof 0.014/0.013 m² @z 3.55/3.98 y ~1.9-2.0) are
  the barrel/deck + hood/crown projection-gap class the tool itself
  flags for §B2 cross-check — machine hole scan 0 rules them benign.
- **FRONT SLOPES + NO STAIRCASES + SLOPE-MOTIVATES-THE-MASS (§B1):
  MIXED.** Glacis: PASS — the r5 one-rake driver step holds at 1×;
  worst lower-front flags Δ+4.8° ±0.6° (frontleft z 2.69..2.93) /
  Δ+5.5° ±0.4° (close-front z 4.16..4.36) — detail class, not slab-vs-
  rake. Bow horn: PASS — at 4× the horn reads one smooth falling fin
  (the two-threshold sliver work paid off). FAILS at 1× under the new
  §B1 clause: (1) the TURRET PLAN FRONT reads as a 3-step slab taper
  with hard 90° corners where the ref casting is ONE pear curve
  (top-view 3× decisive; NO-STAIRCASES composite — order 3a); (2) the
  canvas HOOD box's clean rear corners stand free past the casting
  line and (3) the crown-ridge plate shows its edge line all round —
  plate-over-box grammar the real casting blends (order 3b). Crown
  roll-off flats measured: front upper Δ+14.4° ±0.5° (len 0.30 m @x
  0.79..0.98 y 2.56) and frontright Δ+12.7° ±0.8° (len 0.34 m @z
  0.30..0.68 y 2.80..2.85) — the right crown reads flat where the ref
  falls ~15-17°.
- **DECORATION / MG PHYSICS: PASS** — census mg1+0d ✓
  (FITTINGS.pintleMG MAG, the §H.4 mark tell). Deck-polarity correct:
  crown-riding DARK gun per the pale-deck inversion law; receiver reads
  as a box with pale top-lit highlights at close-roof/hero (not a
  stick); from dead-rear it is a small honest pintle cluster (mast ~9 px
  @y 124, growing to the cupola mass) — stowed-fitting class, no order.
  Duffels/smoke/cables/bins dress the flats; hue measured ref-parity
  (duffel meanRGB (53.5,54.5,40.4) vs ref field (51.3,55.0,43.7)).
- **TURRET FURNITURE PARENTING: PASS** — audit stranded 0 / abutting 0
  / dangling 0.
- **TRACK RUN \\____/: PASS-with-watch** — both end wheels raised, both
  ramps read, trapezoid correct. WATCH: the departure-zone lower-rear
  edge reads STEEPER than ref in all four quarters (rearright Δ+13.1°
  ±0.7° len 0.90 m; rearleft mirror Δ-13°; frontright Δ+10.6°,
  frontleft Δ-9.8°) — order 4b gates re-measure before any geometry.
- **VARIANT-DISTINCTIVENESS (§H.4): PASS** — fresh 3-up strips
  (left/front/close-roof; c5 from the sibling critic's same-morning
  pairs, chieftain5 frozen graduate): (1) c3 SHORT low bustle vs c5's
  long walled bustle with tall bin banks; (2) c3 slim 20-pdr with low
  collar/evac vs c5's fat TOP-OFFSET L7 drum mid-tube; (3) c3 MAG
  pintle vs c5 M2; (4) c3 big duffel row + LOW TRIPLE smoke bins vs
  c5 2×6 discharger banks; (5) c5 carries the mk5 glacis periscope
  hump; (6) chieftain5 is unmistakable (needle-nose no-mantlet turret,
  exposed upper run, twin masts, sleeved L11). Weakest at side-1×
  (bustle + drum + cupola carry it) — no re-badge read. Both centurions
  share driver A (family-level; the c5 critic prices its copy).
- FILL/CIRC: FILL PASS. CIRC FAIL-as-ordered — the proc pairs ZERO
  arcs in 14/14 views while the ref shows 1-3 per view: cupola ring
  r 0.10 span 101° (front @x −0.93..−0.76 y 2.77..2.92), fender lamp
  r 0.18 span 212° (frontleft z 3.42..3.52 y 1.64..1.90), sprocket-zone
  r 0.51-0.53 spans 116-139° (rearleft/frontleft z ~−1.79) — the
  wraps read as polygonal shoe combs and the cupola as a faceted drum
  (orders 1c/3c/4c).

## r5/r6 builder-claims audit (§D; on MY fresh pairs)

1. r5 "face zone cured via hood 0.565": CONFIRMED in masks (front_hull
   94.7, turret rows released) — but the face TONE is now the front
   view's weak spot (driver B: med 47.2 vs ref 53.4, window below).
2. r5 muzzle axis 1.905 / slim evac 1.12: reads true — the tube is
   clean, collar subtle; muzzle profile parity at close-front (Δ edge
   flags ≤5.5° there, all detail class).
3. r6 ramp-pad ground work: station tops verified by the gate (95.2);
   no ground-dip read in any pair; ramps rise from true feet — only
   the STEEPNESS watch above stands.
4. r6 turret plan retable: turret_plan 95.4 confirmed ×2 — the mask
   columns pair; the STEP GRAMMAR the slabs use to hit those columns is
   this round's §B1 order (masks fine, read fails).
5. r6 left-lean rear wall split: visible and correct in top/rear pairs
   (left wall crest reaches farther aft/outboard — matches the print's
   lean); no symmetric-wall phantom columns.
6. Packet certified residuals re-verified as certified: the zb −0.82
   AA-class single column (~0.5 pt), gun-run ±0.03 wobbles, vane-class
   anchor tax (c5 packet), station-0 trim class — carried, not scored.

## The two measured drivers (all views)

- **A. GEAR-CONTRAST CLASS (tone/material lane)** — the two-layer track
  reads BLACK-AND-TAN where the whole ref undercarriage is one muted
  olive family. Fresh windows (ITU-601, fg = NOT(bg maxch≤13 ∧ B−R≥8)):
  - view-left gear band [60..590]×[368..404]: proc sub-30 **3695** px,
    p5 6.8, sd 21.5 vs ref **0**, p5 50.3, sd 4.4.
  - view-front track columns [72..178]/[462..568]×[352..548]: proc med
    **30.4/31.1** sub-30 **9282/9262** vs ref med 57.7/56.2 sub-30 5/4.
  - view-rear track columns [72..178]/[462..568]×[400..570]: proc med
    **13.1** BOTH sides, sub-30 **10406/10421** vs ref med 58.8/60.1,
    sub-30 0 — the rear columns are effectively pure black frames.
  - close-front lower band [0..640]×[330..478]: proc sub-30 **8695**
    (p5 6.8) vs ref **0** (p5 48.0) — the merkava1b law-window class,
    4.4× stronger here.
  - Grammar terms at 4×: specular BLACK shoe blocks + PALE tan chain/
    pads (two-way contrast overshoot), pale drawn bolt-ring disc faces
    inside the wraps (ref: occluded dark), comb-gap air through the
    wrap (front/rear col air 9.3/9.7% vs ref 5.5/7.6%), sprocket zone
    [47..145]×[336..404] sub-30 752 vs 0. Hits 13 of 14 views.
- **B. INK/CAMO OVERSHOOT + CAD GRAMMAR (tone + flush-relief lane)** —
  the proc stamps MORE deep-dark ink than its print everywhere the deck
  shows, the inverse polarity of the merkava1b finding (§C: tone work
  must hit the ORDERED class — overshoot inverts the law):
  - view-top sub-38: front deck **4792** vs 543, turret plan **3171**
    vs 340, rear deck **5327** vs 567 (9-10×), medians −3.5..−5.3L,
    rear-deck p5 26.3 vs 39.6.
  - close-roof field [100..540]×[240..420]: sub-38 **14302** vs 9967,
    med 43.6 vs 47.0.
  - view-front turret face [230..410]×[150..300]: med **47.2** vs 53.4,
    sub-45 **11023** vs 4407 — the face reads darker/patchier than the
    casting.
  - view-rear bin row [150..490]×[296..336]: med **50.4** vs 57.5,
    sub-45 **2455** vs 10 — pale box faces alternating with slot darks
    vs the ref's soft continuous cluster.
  - BLUE-GLASS class: **177** blue-signature px (B−R≥12, luma>40, mean
    RGB 54/66/78) on the proc close-roof vs ref **0** — periscope faces
    + lamp lenses read as bright glass chips on an all-olive print.
  - Where the fields are honest they are GOOD: left hull band med
    56.5 vs 54.4, turret side med 59.5 vs 58.6 sd 7.2 vs 7.9 (parity);
    tail plate med 54.5 vs 56.2. The problem is the stamped extremes,
    not the base tables.

## Per-view justifications (bar: ≥9.0 "same vehicle, same tier")

- **view-front 8.5** — registration excellent (yawProxy 1.1°, 25 edges
  matched); glacis/turret slopes track. Held by: A at full strength
  (both track columns med ~30, sub-30 ~9.3k vs ≤5 — the two darkest
  masses in frame); B on the face (med −6.2, sub-45 2.5×) + blue chips
  reading at 1×; right crown flat Δ+14.4°; mudflap Δbot +0.648 m both
  corners (@x ±1.63, ref hangs to 0.49); ref lamp/cupola arcs unpaired.
- **view-frontleft 8.6** — identity instant (skirted hull, hood, MAG);
  glacis kit reads. A (bow wrap comb + band), B moderate, hood-box
  corners (§B1), headlamp arc missing, ramp-mirror watch Δ-9.8°.
- **view-left 8.6** — hull/turret side TONE TABLES AT PARITY (med
  +2.1/+0.9, sd 9.8/7.2 vs 4.8/7.9 — the sd gap is driver A's slits,
  sub-30 466 in the skirt band vs 0); silhouette p95 Δtop 0.117 m.
  Held by A (gear band 3695 sub-30 vs 0) dominating the lower third;
  bustle/walls read flat-plated with straight bright top edges (B);
  MAG a faint pip at this range (honest).
- **view-rearleft 8.5** — A worst-class (rear wrap horseshoe + black
  interior field behind it); shelf/flap boxes clean-edged; sprocket
  arc unpaired (r 0.51 span 139° in ref); ramp Δ-13°.
- **view-rear 8.4 — THE FLOOR** — the two full-height near-black track
  columns (med 13.1 vs ref 59-60, sub-30 10.4k each) frame a tail
  plate that is tonally right (med −1.7) but BARE vs the ref's draped
  cable/kit jungle; bin row reads pale-slot-pale (sub-45 2455 vs 10);
  mudflap Δbot +0.973 m both corners; MG cluster honest but thin. The
  most synthetic single read of the fourteen.
- **view-rearright 8.5** — mirror of rearleft (ramp Δ+13.1°, arc
  unpaired, A + shelf boxes).
- **view-right 8.6** — as view-left mirrored (tone tables parity, A
  band, wall-box grammar); front collar/hood side read clean.
- **view-frontright 8.6** — as frontleft; crown flat Δ+12.7° @z
  0.30..0.68.
- **view-top 8.5** — footprint/registration superb (yawProxy 0°, dims
  100 visible); turret plan columns pair (95.4 ×2). Held by B at its
  strongest (sub-38 9-10× on all three deck zones) + the STEPPED plan
  front + drawn hatch circles + the black link-rack combs at the tail
  corners + proc-only 5.4 m skirt double-edges (@x ±1.62-1.64).
- **hero-frontleft 8.6** — the Centurion reads immediately; horn fin
  rake genuinely good. A (wrap combs), B (hood box, plate edges, blue
  chips), fender-lamp class missing.
- **hero-rearright 8.5** — duffel top-slab + wall plates + crown-ridge
  plate edges (§B1) over an A horseshoe; rear deck bright-flat; void
  0.029 m² adjudicated benign (hood/crown gap).
- **hero-toptilt 8.5** — B's plate grammar at its most visible (clean
  boxes on clean decks, ink stamps, comb serration at the deck edge);
  stepped plan front reads even at tilt.
- **close-front 8.5** — muzzle/collar/horn EXCELLENT at 4× (no
  staircase anywhere on the bow); glacis kit subtle vs ref's sculpted
  row. Held by A at its rawest (sub-30 8695 vs 0; pale disc + comb +
  black blocks) and the mantlet-slot hard darks under the hood box.
- **close-roof 8.5** — MAG receiver mass + correct dark polarity;
  bustle lid/walls clean. Held by B: blue chips (177 px vs 0), hood
  box + crown-ridge plate-over-box (§B1), faceted cupola drum vs the
  ref's sculpted ring (arc r 0.10 unpaired), ink overshoot (sub-38
  +43%).

## ORDERS (priced; the razor is turret_side 91.1 / whole 91.2 —
material lanes first, every geometry item carries a gate ×2 hold)

**GROUP 1 — gear-shade lane (driver A; material/tone, zero mask
movement, gate byte-line must hold):**
- 1a. Lift the chain/void near-blacks into the ref's shaded-gear class:
  view-rear columns med 13.1 → ≥40 (ref 59); done-gates: view-rear col
  sub-30 ≤500 each (now ~10.4k), close-front band sub-30 ≤800 (now
  8695), view-left band sub-30 ≤400 (now 3695), windows as printed
  above.
- 1b. Kill the two-way overshoot: shoe pads/chain de-specularized and
  toned from pale-tan toward ref olive — view-front columns med ≥48
  (now 30.4/31.1) WITHOUT re-blackening (p5 ≥30).
- 1c. Idler/sprocket DISC faces + bolt rings → dark-gear class (the
  pale drawn bullseye inside each wrap; ref's are occluded-dark).
- 1d. Comb-gap air: dark backer INSIDE the existing wrap silhouette
  (AABB unchanged): front/rear col air% → ≤7 (now 9.3/9.7; ref
  5.5/7.6).
**GROUP 2 — ink/camo + glass lane (driver B; material/tone):**
- 2a. Camo-bake amplitude rebalance on plan/roof fields: view-top
  sub-38 targets front ≤1500 / turret ≤1000 / rear ≤1600 (ref
  543/340/567); medians +3..+5L; close-roof sub-38 ≤11000. Few deep
  pockets, not many stamps (§C ordered-class law).
- 2b. Blue glass → print class: blue-signature census 177 → ≤20
  (target 0): retint periscope faces + lamp lenses to dark olive-black.
- 2c. Bin-row relief (view-rear [150..490]×[296..336]): med ≥55,
  sub-45 ≤400 — lift slot floors, keep ≤3 true deep gaps.
- 2d. Front face rebalance ([230..410]×[150..300]): med ≥50, sub-45
  ≤7000 — mottle scale down on the casting faces only (glacis is
  already parity).
**GROUP 3 — §B1 cast grammar (GEOMETRY, priced vs the 91.1 razor;
each item lands only with gate ×2 ≥91.1 held, else bank):**
- 3a. TURRET PLAN FRONT de-step: replace the 3-slab taper with a
  chord-limited continuous loft (m47 smoothBustle machinery) holding
  the SAME plan-column extents — mask-neutral by construction; roof-
  invisible chamfers so turret_side rows do not move. Done-gate:
  top-view 3× shows one curve; gate ×2 91.1 held; turret_plan ≥95.
- 3b. HOOD + CROWN-RIDGE blend: chamfer the hood box's free rear
  corners into the casting line; fillet/co-planar-cap the crown-ridge
  plate edges (FLAT-CAP-BEHIND-A-RAKE lineage). Stay inside the §C
  2 px boundary margins; silhouette columns identical.
- 3c. Cupola ring grammar: flush sculpted ring/clip relief on the drum
  (the ref's r 0.10 span 101° arc class), ZERO height change (the
  dims p95 vane anchor is sacred).
**GROUP 4 — small trues (watch/low):**
- 4a. Mudflaps to full width both ends: outer plane → |x| ≈1.63,
  bottoms ~0.5 (evaluator front Δbot +0.648 / rear +0.973 — the ref
  carries them); front/rear masks GAIN matching bottom columns, side
  masks unchanged (same z window). Price vs front_whole 91.2, gate ×2.
- 4b. Ramp-read re-measure AFTER Group 1 (the Δ+13° class may be the
  black shoe-hang line, not the authored ramp); geometry only if the
  fresh evaluator still flags ≥10° with the gear retoned.
- 4c. OPTIONAL: flush lamp faces on the existing headlight pods (ref
  r 0.18 span 212° arc at the fender line) — decoration-law positive,
  zero new columns.
- 4d. Skirt plan double-edge: tone the lip top-face seam to the deck
  class (proc-only 5.4 m edges @x ±1.62-1.64) — plan-internal.

## Residuals certified/priced this round (no orders)
- zb −0.82 single-column AA-class (~0.5 pt) — packet-certified, carried.
- Vane p95 anchor tax + station-0 trim class + gun-run ±0.03 — c5-packet
  certified family classes, carried.
- Track-clip 0/20 rear — documented r6 sprocket-graze AABB class,
  in-band.
- Three evaluator micro-voids — projection-gap class, machine contig 0.
- turret_side trim/interp boundary — RULED by the a20e801 amendment;
  not a visual defect and not re-priced here.
- MAG-only roof (mg1) — §B3 satisfied; second MG left to builder taste
  (§H.4 tell protected either way).

## Verdict

FAIL — floor 8.4 (view-rear), mean 8.53, ceiling 8.6. No mandatory
machine order exists: every §B audit is green, dims/footprint/identity
are graduate-grade, and the mark tells beat its sibling cleanly. The
distance to 9.0 is concentrated in Groups 1-2 (pure material/tone: the
black-and-tan gear and the over-inked decks — both measured at class
strength in every view) plus one priced §B1 geometry order (3a hood/
plan-front cast grammar). Clear Group 1 and view-rear/quarters jump a
class; clear Group 2 and the plan/roof views follow; land 3a/3b inside
the razor and this is a genuine 9.0-track vehicle on its next
adjudication.
