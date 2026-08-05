# centurion3 shaded-parity r7 — SECOND ADJUDICATION, post-tone-round (2026-08-05)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=centurion3` →
shots/critic-centurion3/ (zero console errors; FIFO ticket lock honored —
queued behind the concurrent centurion5 re-adjudication, both landed
14:20). Byte-discipline: `tmp-hashgeo.mjs` centurion3 = **ac63e6d8**
(47 meshes / 70 340 verts) at campaign START and END — exactly the tone-
round release (9062a07); family watch: centurion5 **2395a924**,
chieftain5 graduate **5117b9a8** — both EXACT. Official gate re-run:
**91.1 PASS ×2 bit-identical** (hull 92.4 / whole 91.2 / turret 91.1 /
stations 95.2 / dims 100 / floaters 100) — the razor is still
turret_side 91.1 (1.1 headroom), whole 91.2 behind it.
`visual-evaluator.mjs --id=centurion3`: exit 0, **RIG PARITY OK** (max
yawProxy 1.1° @front, all other orthos ≤0.7°; world offset
Δ(0, 0.023, 1.205) is registration data), evidence at
shots/visual-eval-centurion3/. Tone windows re-derived on MY fresh pairs
via tools/tmp-uk-tone-measure.py (the builder tool reproduces my r6
window rects verbatim — verified by reading it) AND spot-re-derived with
independent code (rear col L med 57.3 sub-30 0; top front deck med 49.9
sub-38 10 — matches to the decimal). Zoom crops diagnosis-only
(scratchpad c3r7/). Laws carried this round: §B1 slope-mass (c1ad424)
and **§B3 NO-MYSTERY-BOXES (ff50bf5, NEW)** swept explicitly below.

## HEADLINE: FAIL — floor 8.7 (six views), mean 8.75, ceiling 8.9 (view-top); no view at the 9.0 bar; zero machine-gate failures; BOTH r6 class drivers verified CURED on my pairs

front 8.8 · frontleft 8.8 · left 8.7 · rearleft 8.7 · rear 8.7 ·
rearright 8.7 · right 8.7 · frontright 8.8 · top 8.9 · hero-fl 8.8 ·
hero-rr 8.7 · toptilt 8.8 · close-front 8.7 · close-roof 8.7

r6 → r7: floor 8.4 → 8.7, mean 8.53 → 8.75, every view up. The tone
round delivered what it claimed: driver A (black-and-tan gear) and
driver B (ink/camo overshoot + blue glass) are dead in every window I
re-measured, and the one geometry item (3a plan-front de-step) reads
clean at 1×/3× with the gate line held to the bit. What keeps the
fourteen under 9.0 now is ONE casting-grammar cluster at the turret
front/crown (the banked 3b/3c), a NEW gear-face grammar finding the
retone itself created (pale ring-less wheels), and the small trues
(flaps/ramps/lamps/seams). No class-level tonal violation remains.

## CALIBRATION RULING FOLLOW-UP (f04beee — the item this round was told to re-verify)

**c3's running gear is GENUINELY VISIBLE. The chieftain5-r4 / c5-r6
wall-hides-gear severity anchor (5.0–5.5 class) does NOT apply.**
Verified at 6× on my fresh view-left/right pairs (ground-line crops in
scratchpad): the skirt hem sits at the authored 0.60 line, and below it
six road-wheel masses, dark inter-bogie bays, the two-layer track
(pads + chain + horns), and both end wheels (sprocket berry-disc,
idler) all read; the 1d /shadow/ backers sit 0.19/0.08 m clear of the
wheel discs (uk.js ukGearAirBackers call, verified in source) and the
skirt-slot recess plate hides BEHIND the skirt face in side view. The
r6 8.x-class scoring lane therefore stands — orders below, not a
re-anchor. HONEST NEW FINDING inside that ruling: the 1c retone killed
not just the pale drawn bullseyes but ALL disc grammar — wheelTone
0x3e4531 / drumTone 0x373d2c / tire ring land within a few luma under
flat side light, so the six wheels render as featureless PALE-SAGE
pillows (the brightest element in the band) against olive bays, the
POLARITY INVERSE of the ref (olive discs with dark-drawn tire-rim +
bolt-dot + hub rings against near-black bays). Measured: left gear band
proc med 58.3 (+6.9L over ref 51.4), p95 73.2 vs 60.0, sd 9.6 vs 4.4;
close-front band p95 84.0 vs 71.8; evaluator left/right refOnly 25/24
edges = the unmatched wheel line-work. Order W1/W2 (material lane).

## Tone-round claims audit (§D: every number re-derived from MY pairs)

| claim (9062a07 / packet r7) | my fresh measurement | verdict |
|---|---|---|
| 1a rear cols med 13.1→57.3, sub-30 10.4k→0 | med 57.3/57.3 (ref 58.8/60.1), sub-30 **0/0** | CONFIRMED, ref-parity |
| 1a close-front band sub-30 8695→0 | **0** (med 61.5 vs ref 60.6) | CONFIRMED |
| 1a left band sub-30 3695→0 | **0** | CONFIRMED (bright-side residual → W1/W2) |
| 1b front cols med 30.4/31.1→52.1/51.7, p5≥30 | 52.1/51.7, p5 42.6, sub-30 1 (ref 5) | CONFIRMED (−5L under ref med, honest) |
| 1d air 9.3/9.7→8.3/8.6 vs ≤7 PARTIAL | 8.3/8.3 front, 8.6/8.6 rear | CONFIRMED partial; air mapped to pane x 72-92 = the OUTER FLAP-WIDTH columns, full-height strip — 4a class exactly as banked, not comb air |
| 2a top sub-38 4792/3171/5327→10/136/161 | **10/136/161** (ref 444/401/472), medians 49.9/50.8/50.5 vs 51.3/51.9/50.6 | CONFIRMED — deck ink now CLEANER than the print, medians parity |
| 2a close-roof sub-38 14302→3228 | **3228** (ref 9967) | CONFIRMED |
| 2b blue chips 177→0 | **0** (ref 0) | CONFIRMED |
| 2c bin row sub-45 2455→100, med 52.7 vs ≥55 PARTIAL | sub-45 **100** (ref 10), med **52.7** vs ref 57.5 | CONFIRMED partial (−2.3 honest; duffels verdict-protected, Y4 slot-floors only) |
| 2d face med 47.2→50.8, sub-45→5548 | med **50.8**, sub-45 **5548** (ref 4407) | CONFIRMED |
| 3a de-step, turret_plan 95.47, gate held | gate 91.1 ×2 bit-identical; top-view 3× = converging diagonals with soft corner-fills, NO step notches; no flagged plan-front edges (top flags: −1.9°±0.3 skirt line, +3.4°±0.5 fender zone, rest ≤ noise) | CONFIRMED delivered; residual read is chordal-vs-pear at ≥8× only |

## Standing checks (§B + §D + §H.4)

- **TRACK CONTAINMENT: PASS** — `track-clip-audit --exact` **0 front /
  20 rear** (the documented r6 sprocket-graze rig_hull class, kv2 band
  ≤60); no tooth-over-plate at 4×.
- **CONTIGUITY: PASS** — machine contig 0; decks filled at top/toptilt;
  the evaluator's three enclosed-voids are the SAME projection-gap
  trio as r6 (hero-rr 0.029 m² @(−0.64, 2.49, 1.00); close-roof
  0.014/0.013 m² @z 3.55/3.98) — §B2 hole scan 0 rules them benign;
  border-cut chains stayed under borderClips (§D law, no orders at
  them).
- **§B1 FRONT SLOPES / NO STAIRCASES / SLOPE-MASS: MIXED (improved).**
  Glacis PASS (one rake at 1×; lower-front flags 4.8°±0.6 / 5.5°±0.4
  detail class). Turret cheeks rake — no slab front. 3a de-step
  DELIVERED (above). STILL FAILING the slope-mass clause at the turret
  front/crown: the canvas-hood box's free rear corners past the casting
  line, the crown-ridge plate edge reading all round, the hard-cornered
  rectangular mantlet recess, and the crown roll-off FLATS — front
  Δ+14.4°±0.5 (len 0.30 m @(0.88, 2.57)), frontright Δ+12.7°±0.8
  (0.34 m), left-side mirror close-front Δ−11.7°±0.6 / toptilt
  Δ−11.9°±0.6, close-roof roof-line Δ−5.5°±0.1 (len 1.47 m) — the ref
  crown falls ~15-17° where the proc flats. = banked 3b/3c, now order
  X1/X2, the LAST §B1 item on this tank.
- **§B3 DECORATION + MG PHYSICS + NO-MYSTERY-BOXES (NEW): PASS.**
  Census mg1+0d ✓ (FITTINGS.pintleMG MAG — §H.4 tell; hand-authored
  dressing carries the packet justification). Deck-polarity correct
  (crown-riding dark MAG, receiver reads as mass at close-roof).
  Mystery-box sweep at 3-5× (crops banked): spare-link runs carry
  chevron grammar; bins carry lid seams + rivet dots; duffels read
  cloth with edge piping; periscope boxes carry hood+face; smoke
  dischargers read as bins-on-bracket-arms angled outboard (tube tell
  weak from front — note only, the print's own read is a dark
  cluster); the gun-root canvas hood reads woven at 4× (identifiable —
  its BOX grammar is X1, not a mystery box). ONE flag: the left glacis
  pod shows a hard-BLACK rectangular face (lamp with no lens tell) —
  folds into Y1 (4c lamp faces). No bare unidentifiable cuboids near
  mantlet/gun root/armor faces.
- **TURRET FURNITURE PARENTING: PASS** — stranded 0 / abutting 0 /
  dangling 0.
- **TRACK RUN \\____/: PASS shape / ORDER on steepness.** Both end
  wheels raised, both ramps read, trapezoid correct. The r6 4b gate
  ("geometry only if the fresh evaluator still flags ≥10° with the
  gear retoned") RESOLVES TO GEOMETRY: with the gear fully retoned the
  departure-zone flags persist to the decimal — rearright Δ+13.1°±0.7
  (len 0.90 m), rearleft Δ−13.0°±0.7 (0.87 m), frontright Δ+10.6°±0.5,
  frontleft Δ−9.8°±0.5 — this is the authored ramp line, not shoe-hang
  shadow. → X4 (priced).
- **§H.4 VARIANT-DISTINCTIVENESS: PASS** — fresh 3-up strips (my c3
  pairs; c5's same-hour re-adjudication pairs; chieftain5 frozen-
  graduate pairs, hash verified): (1) c3 short LOW bustle vs c5 long
  walled bustle + tall bin banks; (2) c3 slim 20-pdr, collar only, vs
  c5 fat L7 with the TOP-OFFSET mid-tube drum (reads in side view);
  (3) c3 MAG vs c5 M2; (4) c3 duffel row + LOW TRIPLE smoke bins vs c5
  2×6 discharger banks; (5) c5 mk5 glacis periscope hump; (6)
  chieftain5 unmistakable (needle nose, exposed upper run, twin
  masts). NEW family-level watch: BOTH centurions now share the
  pale-ring-less wheel-face read (same ukToneKit values) — W1 is a
  family recipe fix; each mark's critic prices its own copy.
- **CIRC/ARCS: FAIL-as-priced (unchanged r6 class)** — 0 paired arcs
  in 14/14; the ref presents cupola ring r 0.10 span ~101°, fender
  lamp r 0.18 span ~212°, sprocket-zone r 0.51-0.53 spans 116-139°.
  X2 (cupola relief) + Y1 (lamp faces) carry it; wrap-zone arcs come
  free with W1's rim rings.
- **Off-palette sweep: CLEAN** — the faint warm seam lines on box
  edges probe at r−b ≤ +23 on isolated pixels with olive means
  (52-64/56-66/40-51) = warm khaki edge-light, in the ref's own dust
  family; blue-signature 0 fleet-wide on close-roof.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier")

- **view-front 8.8** (was 8.5) — cols cured to near-parity (med
  52.1/51.7 vs 57.7/56.2, sub-30 1 vs 5); face lifted (50.8/5548).
  Holds: crown flat Δ+14.4°; mantlet-slot hard rectangle + hood box;
  flap bottoms absent (profile Δbot p95 0.234 m; air strip x 72-92);
  discharger tubes weak; cupola arc unpaired; face med still −2.6.
- **view-frontleft 8.8** (was 8.6) — identity instant; bow wrap comb
  olive; fender-line flags ≤6.1° detail; ramp −9.8° under gate.
  Holds: hood-box corners past the casting line; lamp arc missing;
  wheel pillows at angle; skirt strip tab repetition.
- **view-left 8.7** (was 8.6) — hull/turret tables parity; two-layer
  track + trapezoid honest. Holds: the W-class (pale ring-less wheels,
  +6.9L band, sd 9.6 vs 4.4, refOnly 25 wheel-line edges); wall boxes
  with straight bright top edges; MAG a pip (honest).
- **view-rearleft 8.7** (was 8.5) — wrap horseshoe + interior cured to
  olive; shelf courses honest. Holds: ramp Δ−13.0°; sprocket arc
  unpaired; bustle-tub plate grammar; clean-edged shelf boxes.
- **view-rear 8.7** (was 8.4, the r6 floor — the predicted class jump
  delivered) — columns REF-PARITY (57.3 vs 58.8/60.1, sub-30 0 vs 0);
  bin row sub-45 100. Holds: bin-row med −4.8 (slot spread, Y4); tail
  plate BARE vs the ref's draped-cable jungle (Y3); flap columns
  (air 8.6%, X3); MG cluster honest-thin.
- **view-rearright 8.7** (was 8.5) — mirror of rearleft; ramp Δ+13.1°.
- **view-right 8.7** (was 8.6) — as left mirrored; right crown line
  Δ+9.1°±0.7 upper; front fender line Δ+3.7°.
- **view-frontright 8.8** (was 8.6) — as frontleft; crown Δ+12.7°.
- **view-top 8.9** (was 8.5; the round's ceiling) — footprint superb
  (yawProxy 0°, p95 Δtop 0.073 m); deck ink CLEANER than print at
  parity medians; 3a plan front de-stepped; link combs identifiable.
  Holds at 8.9: skirt double-edges @x ±1.62-1.64 (Y2), procOnly 26
  panel-line clutter, chordal nose vs pear at high zoom.
- **hero-frontleft 8.8** (was 8.6) — the garage read is RIGHT; horn
  fin, stance, tube. Holds: hood/crown plate edges; wheel pillows;
  fender lamp class.
- **hero-rearright 8.7** (was 8.5) — tail composition + rear deck now
  read; duffel slab identifiable. Holds: bustle-tub walls + crown
  ridge (X1), ground-line ramp Δ+12.2°±0.4, pale duffel top-slab
  cleanliness.
- **hero-toptilt 8.8** (was 8.5) — ink stamps gone; furniture toned.
  Holds: plate/box grammar density vs the cast print; crown flats
  Δ−11.9°.
- **close-front 8.7** (was 8.5) — the r6 rawest-A window now reads
  ZERO sub-30; muzzle/collar/horn excellent at 4×. Holds: mantlet-slot
  hard darks + hood box (X1); pale ground wedges at 4× (W2); fender
  line Δ+5.3°±0.1 over 3.09 m (real, small); glacis kit subtle vs
  sculpted; black lamp face (Y1).
- **close-roof 8.7** (was 8.5) — blue chips 0; ink cured; MAG mass +
  polarity right. Holds: hood + crown-ridge plate-over-box (X1);
  faceted cupola drum, arc unpaired (X2); roof rear-line Δ−5.5° over
  1.47 m; tall rear-corner bin plain (tell present but weak).

## ORDERS (priced vs the 91.1 razor / 1.1 headroom; material first)

**GROUP W — gear-face grammar (material/tone, zero mask movement,
gate byte-line must hold; family recipe — c5 shares):**
- W1. ROAD-WHEEL RING GRAMMAR: restore the dished-wheel three-ring
  read DARK-ON-OLIVE (tire-rim edge, bolt-dot circle, hub ring) — the
  geometry already exists; split the merged tones (tire ring and
  bolt/hub features ~8-12L below the disc face; the r6 pale-bullseye
  overshoot stays dead). Done-gates: six discs read as WHEELS at 4×
  in view-left/right (ring structure visible); left band p95 ≤65
  (now 73.2), sd ≤7 (now 9.6); sub-30 census ≤400 held (no
  re-blackening).
- W2. GROUND-LINE WEDGES → shaded-run class: the pale sage contact-
  zone masses tone into the bay family; close-front band p95 ≤75
  (now 84.0); no new sub-30.
- W3 (optional fine-trim): front-col medians +3..4L toward ref 57
  (now 52.1/51.7), p95 ≤65 — only if free alongside W1/W2.
**GROUP X — casting grammar + small geometry (each lands ONLY with
gate ×2 ≥91.1 held, else re-bank; §C 2 px margins everywhere):**
- X1 (= r6-3b, banked→ordered): hood rear-corner chamfers into the
  casting line; crown-ridge plate co-planar caps (FLAT-CAP-BEHIND-A-
  RAKE); soften the mantlet-recess hard rectangle. Silhouette columns
  identical by construction; roof-invisible chamfers only.
- X2 (= r6-3c): cupola sculpted ring/clip relief on the drum (the
  ref's r 0.10 span 101° arc), ZERO height change (2.92 p95 vane
  anchor sacred).
- X3 (= r6-4a): mudflaps to full width/drop both ends (outer plane
  |x|≈1.63, bottoms ~0.5) — kills the LAST 1d air residual (8.3/8.6
  → ≤7) and the front/rear profile Δbot cliffs; front/rear masks GAIN
  bottom columns: price vs front_whole 91.2 + side rows, gate ×2.
- X4 (= r6-4b, gate resolved): departure-ramp angle true-up at both
  sprocket quarters (persistent Δ±13° len ~0.9 m post-retone);
  re-derive contact tangents from the ref ramp line; trackCurves +
  whole rows watched, gate ×2.
**GROUP Y — small trues (free):**
- Y1 (= r6-4c): flush lamp faces on the headlight pods (also kills
  the glacis black-rectangle read).
- Y2 (= r6-4d): skirt lip top-face seam → deck class (plan
  double-edge @x ±1.62-1.64).
- Y3: tail-plate dressing per the print's draped tow-cable class
  (c5's O5 recipe exists; §B3 tells mandatory).
- Y4 (= r6-2c residual): bin-row slot floors → med ≥55 (duffels
  untouched, verdict-protected).

## Residuals certified/carried (no orders)
- zb −0.82 single-column AA-class (~0.5 pt); vane p95 anchor tax;
  station-0 trim; gun-run ±0.03 — packet-certified family classes.
- Track-clip 0/20 rear sprocket-graze — documented, in-band.
- Three evaluator projection-gap micro-voids — machine contig 0.
- turret_side trim/interp boundary — a20e801 amendment, not re-priced.
- mg1 MAG-only roof — §B3 satisfied, §H.4 tell protected.
- Warm khaki edge-lights (r−b ≤ +23 isolated) — in-family, watch only.
- Chordal-vs-pear plan nose at ≥8× — below the 3× bar, watch only.

## Verdict

FAIL — floor 8.7, mean 8.75, ceiling 8.9; no view at 9.0. But this is
the program's cleanest FAIL: both r6 class drivers verified dead in
every re-measured window, the 3a geometry landed inside a bit-identical
gate line, the calibration ruling resolves in c3's favor (gear open and
visible — no severity re-anchor), and every machine gate is green.
**Graduation distance, called explicitly: this mark had the strongest
first-round base in the UK file (8.4/8.53 vs the siblings' 5.5-class
starts) and now stands three tenths from the bar with NO tonal class
violations left.** The residue is one casting-grammar cluster (X1/X2 —
the only §B1 item standing), one family material recipe (W1/W2 wheel
rings — the retone's own honest overshoot), and priced small trues
(X3/X4/Y). Land W+X1+X2 with the gate held and the side/close views
reach 8.9-9.0; add X3/X4 inside the 1.1 headroom and this is a
9.0-every-view graduation candidate on its next adjudication.
