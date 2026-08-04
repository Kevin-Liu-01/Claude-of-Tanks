# merkava1b shaded-parity r12 — FIRST FORMAL SOLO ADJUDICATION (2026-08-03)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=merkava1b` →
shots/critic-merkava1b/ (zero console errors). Byte-discipline:
`tmp-hashgeo.mjs` merkava1b = **6bcb98c9** (the r11 landing hash) BEFORE
and AFTER render; every family member byte-exact on my watch (3b
**a4ed2c82** / 3c **1d9b026c** / 3d **954a9650** — today's graduate — /
2b 9bfe0895 / 2d 62456460 / 4 e1d164dc / 4b d44a3624). Official gate
re-run: **90.0 PASS ×2 bit-identical** (hull 91.2 / whole 90.0 / turret
90.8 / stations 91.9 / dims 100 / floaters 100) — whole rides the EXACT
90.0 razor, so the razor bind rules this round's orders: MATERIAL/TONE
lanes wherever possible, geometry only where priced or mandatory.
`visual-evaluator.mjs --id=merkava1b`: exit 0, **RIG PARITY OK**
(11 ortho views, max dYawProxy 1.1° @front, |dCentroid| ≤0.208 m),
evidence at shots/visual-eval-merkava1b/. Measurements: my own sweep on
MY fresh pairs with the banked scanners (tools/tmp-r7-merkava.py,
ITU-601 + mask-method maxch class); zoom crops diagnosis-only
(scratchpad crop1b.py). Numbers below all re-derived this round (bank
law) with windows quoted.

## HEADLINE: FAIL — floor 8.4 (hero-rearright), mean 8.55, no view at the 9.0 bar; ONE MANDATORY machine-gate order (track containment 119/607 vs the ≤60 band)

front 8.7 · frontleft 8.6 · left 8.6 · rearleft 8.5 · rear 8.5 ·
rearright 8.5 · right 8.6 · frontright 8.6 · top 8.7 · hero-fl 8.6 ·
hero-rr 8.4 · toptilt 8.5 · close-front 8.5 · close-roof 8.5

This is merkava1b's first independent verdict (r8 was the last paired
one: FAIL min 8.0). The r9/r10/r11 builder rounds delivered real lifts —
the r8 named defects are all CURED or measurably moved (audits below) —
but the fresh pairs surface four cross-cutting drivers the self-reads
under-priced, plus a standing-check failure no prior round ever
measured. The vehicle identity is right; the tier is not yet: "graduate
tier" here means the 3-series' cast-surface richness, and 1b currently
reads one class cleaner/flatter/darker-tracked than its print. All four
drivers are majority TONE/MATERIAL-lane — the razor mostly does not
block this roadmap.

## Standing checks (§B + §H.4)

- **TRACK CONTAINMENT: FAIL (machine gate)** — `track-clip-audit
  --exact`: **front 119 / rear 607** voxels vs the ≤~60 kv2-graduate
  band (graduates 3b/3c/3d re-measured today: 0/0/0). Hit boxes: front
  rig_hull 119 @ x ±1.56, y 0.28..1.02, z 1.84..2.30 (keel-knee flanks
  inside the bow wrap); rear rig_hull 343 @ x ±1.70, y 0.48..1.16,
  z −4.00..−3.52 + three unnamed meshes 148/60/56 in the same stern
  band (rack lower structure / flap fills). VISUALLY CONFIRMED at 4×
  (view-left stern): the chain knobs of the idler wrap run INTO the
  rear rack lower rails/plate. `tank-standard-check`: clip ✗ (its only
  machine-gate failure), contig **0 ✓**, gate ✓.
- **CONTIGUITY / NO EMPTY AREAS: PASS** — machine contig 0; 14 views +
  zoom crops show no floating masses and no see-through voids; top-down
  and toptilt decks are filled. Evaluator's hero-toptilt proc
  enclosed-void 5.018 m² @ x 1.46 y 1.35 z 0.38 is the §D-caveat
  tilt-projection bay class (3d graduated with 5.34 m² in the same
  view); mask-method air over the fender band reads parity (63.7% vs
  63.5% in [60..420]×[420..620], all outside the hull edge).
- **FRONT SLOPES: PASS** — front primaries: 30 matched, worst flag
  Δ-4.3° ±0.4° is the track-band vertical @ x −1.75..−1.73 y 0.48..0.78,
  not the glacis; glacis rake follows the ref. Watch items (gate-priced
  detail class): fender-nose segments Δ+9.2° ±0.7° (z 1.55..1.89
  y 1.65..1.67) / Δ-8° ±0.8° (z 1.25..1.55), mirrored on the right
  (Δ-10.7° ±0.5°, z 0.72..1.16). Proc-only arc r 0.40 m span 129.7° @
  x −0.83..−0.55 y 2.74..2.79 = the SANCTIONED dome crown (r5 item 4
  certified rise; the ref's own band rows are flat 2.630) — cited, not
  scored against.
- **DECORATION / MG PHYSICS: PASS-with-residual** — commander .50:
  pale top-lit crest bar + tapered rod both orthos (rod-table med 93.7
  vs ref 91.5 left / 77.4 vs 80.5 right — tone class right), T-mast
  dead-front, receiver mass at close-roof; but NO free-sky gap under it
  (certified bind: dims p95 + dome z — the ref's root-rigged .50 floats
  at h' 2.83 and reads 69-75px sky runs; ours is crest-riding, the
  documented honest cap). Loader gun = correct pale-deck INVERSION
  (dark crown-riding rod on the certified head-pot column). Second roof
  MG (r9 boom MAG, owner law): present, reads in toptilt/close-roof;
  from dead-rear and the rear quarters it does not break the skyline as
  a gun (order 4c). mg0+0d census = hand-authored ref-parity
  instruments with the standing §I packet justification — same class
  and owner-call carry as the 3-series graduates.
- **VARIANT-DISTINCTIVENESS (§H.4): PASS** — fresh 4-up strips
  (left/front; 3b/3c/3d byte-frozen at their graduate hashes): (1) 1b
  is the family's ONLY exposed-running-gear member — six dished road
  wheels + thin fender line vs full wavy-tooth (3b/3c) / straight
  paneled (3d) skirts; (2) compact stepped early-mark turret with round
  commander dome + center .50 vs the 3-series long wedges with brow
  boxes; (3) rear bustle basket + ball-and-chain fringe + hull tail
  rack box vs 3d's long slatted overhang / 3b-3c short baskets; (4)
  M64 wide-flat mantlet drum + bare tube + sleeve-clamp ring vs the
  3-series stepped/sleeved 120s; (5) bow grammar: glacis chevron +
  toe-rib row vs the 3-series towLit eye plates + cable furniture. No
  re-badge read. The early-mark ROUNDNESS tell, however, is thin: only
  the dome carries "cast Mk.1" curvature — the shell reads faceted
  (scored in the views, order group 2).
- FILL/CIRC: FILL PASS (closed decks). CIRC PASS-with-residual —
  wheels/rings/dome read round in silhouette; from above the dome
  reads as a DRAWN circle pair (ring + lid) rather than a shaded mound
  (order 2d; the 3d cert-5 lesson).

## r9-r11 builder-claims audit (§D; on MY fresh pairs)

1. r10 gear identity: wheel dish anatomy CONFIRMED (first-wheel window
   [150..205]×[392..428] med 56.0 EXACT = ref class 55.6) — but the
   window's p5 is 29.5 vs ref 52.9: the near-black is the CHAIN band
   behind/below the wheels (driver A below), not the wheel faces.
2. r10 sprocket black-C: the flat-black disc IS dead at close-front
   (no ~90px disc; pale wheel-form + teeth read). The zone's darkness
   moved, not died: the whole lower band [0..640]×[380..560] reads
   **1995 sub-30 px vs ref 0** — the shade class of the chain itself.
3. r10 keel/rear retones: keel-face MEDIAN parity confirmed (window
   x 430..465 / 175..210, y 488..512: med 101.3/100.7 vs ref
   102.6/101.6) — but sd 1.44/0.46 vs ref 9.12/8.06: the panel is
   dead-flat where the ref is mottled. Corner flap-gap windows
   ([482..532]/[108..158] × [424..500]): proc med 68.5/65.8 vs ref
   94.6/94.3, p5 46.5 vs 59.5-60.5 — the corner zone still reads a
   full class darker than the ref's (r10's own residual (a), now with
   my windows).
4. r11 hero-rr through-read: REPRODUCED EXACTLY (window [420..500]×
   [325..385]: proc p95 98.9 / med 77.2 / p75 79.2 vs ref 107.2 /
   85.8 / 99.5) — the lit rolls print; the med −8.6 ambient floor and
   the missing p75 quartile stand (order 3c extends the mechanism).
5. r7 protections re-verified: front crown longest flat 37px @y184 vs
   ref 30px @y195 (window [150..500]×[168..215] ≥30) — holds; toptilt
   tail zone [380..560]×[430..520] med 87.3/sd 10.0 vs ref 83.3/10.1 —
   no pocket punch; top mid-deck [220..420]×[300..430] med 86.8 vs
   85.2, sd 7.00 vs 6.29 — tone table parity; hull side band
   [120..500]×[345..375] med 94.4 = 94.4 EXACT.
6. r9 second MG: present and probe-placed as recorded; read strength
   scored in the views (order 4c).

## The four measured drivers (all views)

- **A. GEAR-SHADE CLASS (tone lane)** — the shaded chain/shoe floor is
  24-30L where the ref's whole lower band floors at 35+: close-front
  sub-30 census **1995 vs 0**; wheel-window p5 29.5 vs 52.9. Plus two
  proc-only grammars: the wrap reads as SEPARATED dark knobs with pale
  gaps (ref: continuous brown band), and the REAR IDLER wears a bright
  pale bullseye disc (ref idler is dark/occluded; the r10 pale cover is
  ref-true only at the FRONT sprocket). Hits every view containing
  track; worst at close-front and all rear quarters.
- **B. CAST-vs-CAD SURFACE (tone lane)** — the proc compresses the
  ref's tonal range on every large surface: turret side band
  [330..560]×[270..330] p5 67.8 vs 46.6 / p75 98.9 vs 105.3 (missing
  deep fitting shadows AND highlight sparkle); keel faces sd 0.5-1.4
  vs 8-9; glacis-top band [200..440]×[60..120] med 92.1 vs 85.7, sd
  7.1 vs 11.5 (brighter and half the texture); ink distribution from
  above INVERTED: sub-38 **0 vs 23** (no deep ink at all) while sub-55
  is **1169 vs 472** (2.5× diffuse mid-dark hairlines) — the ref draws
  FEW DEEP pockets, the proc draws MANY PALE lines; close-roof deck
  band sub-45 168 vs 52 with med parity (79.1 vs 82.5). Reads as
  drafted panels vs cast steel everywhere, worst at top/toptilt/
  close-roof/heros.
- **C. DEAD-REAR VOID GRAMMAR (mixed lane)** — the ref's basket band
  y210-250 ([260..380]) is **32.5% AIR** (sky through the open frame +
  chains); the proc's is 5.4% (solid vane + billows). One band down
  (y290-330) the polarity flips: the proc carries its dark pockets
  there (p5 23.7) where the ref reads uniformly BRIGHT (p5 90.0, med
  99.4) — the r6/r9 pocket row mimics a void class the ref actually
  keeps HIGHER and as real air. The proc's dark is in the wrong band.
- **D. BASKET WALL-BACKED QUARTERS (certified-edge lane)** — from the
  rear quarters the ref basket is a pale frame over DEEP through-
  shadow; the proc is a pale frame over its own pale vane wall (4×
  crops decisive). The r11 hero-rr numbers above quantify it; true
  rim-cresting contents stay razor-blocked (certified), but the
  missing-highlight half of the gap (p75 −20.3) is material-lane.

## Per-view justifications (bar: ≥9.0 "same vehicle, same tier")

- **view-front 8.7** — registration/slopes/footprint excellent
  (yawProxy 1.1°, primaries 30 matched, worst flag a track-band
  vertical); crown flats at r7 protection level (37px vs ref 30);
  .50 T-mast + box bank read dead-front. Held down by: A (track
  fronts read knob-dark with pale slits; ref blocks solid brown), the
  corner flap-gap darkness both ends (H-window med 68.5/65.8 vs
  ~94.5), and the tunnel-through class (profile Δbot −1.24/−1.26 m @
  x ±1.58: proc rear-track content visible under the flap where the
  ref masks it).
- **view-frontleft 8.6** — same vehicle instantly; glacis kit +
  chevron + cable read. A (sprocket wrap knobs + chain band), B
  (glacis-top brightness/flatness, boxy turret panels), fender-nose
  angle watch (Δ+5.4° ±0.7° z 1.90..2.13). 
- **view-left 8.6** — hull band med 94.4 EXACT parity; wheel dish
  anatomy = ref class; fender line straight and true. A (gear band +
  pale idler bullseye at stern), B (turret side compression p5/p75;
  the bustle/basket stack reads stepped-boxy vs the ref's soft cast
  wedge + irregular kit), E (.50 = crest bar vs ref's floating gun —
  certified cap, priced here only as read).
- **view-rearleft 8.5** — A (chain knobs + idler disc), C (band air
  5.4% vs 32.5% reads as "solid shelf" vs the ref's open frame),
  B (rear rack side slab flat + pale), the basket-over-wall read from
  this quarter.
- **view-rear 8.5** — C at its purest: ref = air + chains + irregular
  bright kit; proc = solid vane + machined slot row in the WRONG
  (bright) band + ball dots on a pale plate. G: lower-rear furniture
  density (3× crop: ref pintle/chain/clevis jungle vs proc's sparse
  bolt dots — r10's tailKit filled the notch, the flanking faces are
  bare). H: corner windows −26L med. Keel-face median parity holds
  (retone landed) but dead-flat (B).
- **view-rearright 8.5** — mirror of rearleft plus the strongest
  wall-backed basket read (4× crop: rails over pale wall vs rails
  over shadow).
- **view-right 8.6** — as view-left (rod-table 77.4 vs 80.5 tone ok;
  same A/B/E items, mirrored fender watch Δ-10.7°).
- **view-frontright 8.6** — as frontleft, mirrored.
- **view-top 8.7** — footprint/registration strong (top yawProxy
  0.1°); mid-deck tone table parity (med +1.6, sd 7.00 vs 6.29);
  basket arc + falling rim track the print. Held by B's ink
  inversion (0 sub-38 vs 23; 1169 sub-55 vs 472 — hairline-seam
  network vs few deep pockets), glacis band bright-flat (med +6.4,
  sd −4.4), dome plan reads as drawn ring pair, pocket row reads as
  machined slots from above.
- **hero-frontleft 8.6** — dished wheels under the fender line, dome
  crown arc, glacis kit all read; A (gear), B (big flat glacis +
  boxy roof furniture vs the ref's mottled cast + irregular kit),
  bow tow hook brighter/blockier than the ref's subtle clevis.
- **hero-rearright 8.4 — THE FLOOR** — the r11 residual reproduced
  exactly (med 77.2 vs 85.8, p75 79.2 vs 99.5): the basket zone is an
  ambient-floored flat where the ref is lit-bars-over-shadow; C + D
  + A (idler bullseye + knob comb prominent at this angle) + B
  (turret slab). Every lane order (1b/2a/3a/3b/3c) hits this view.
- **hero-toptilt 8.5** — B at its most visible: large uniform panels
  + drawn circles (dome ring + lid) vs the ref's shaded cast mounds
  and textured deck; C (basket band); the fender-line chain comb
  (A) serrates the deck edge where the ref's track edge is soft.
  Machine contig 0 and the §D-caveat bay note recorded above.
- **close-front 8.5** — containment zone renders without visible
  tooth-over-plate at this angle (the audited bow overlap is
  keel-flank-internal); bow furniture reads. Held by A at its worst
  (sub-30 1995 vs 0 — the chain in shade IS the near-black of this
  view), the pale toe hook block vs the ref's subtle bracket, glacis
  large-field flatness at close range (B), and the corner flap slot.
- **close-roof 8.5** — .50 cluster mass + two-tone + T-mast read;
  deck med within 3.4L. Held by B: sub-45 ink 168 vs 52 as hairline
  net, large uniform panels with drafted borders, dome = drawn
  circle pair vs cast mound (2d), boxy right-wall bins with CAD
  edges; the ref's rolling cast camber grammar is absent.

## ORDERS (grouped by driver; material/tone lanes first; every
geometry item carries razor pricing law — whole sits at EXACTLY 90.0)

**ORDER 0 — MANDATORY (machine gate; geometry, but mask-lane-neutral
if done right): TRACK CONTAINMENT 119/607 → ≤60 per zone (target 0).**
Zones: bow x ±1.43..1.97 (both sides), y 0.28..1.02, z 1.84..2.30
(rig_hull keel-knee flanks inside the wrap volume); stern y 0.48..1.16,
z −4.02..−3.52 (rig_hull 343 + rack-lower/flap meshes 148/60/56).
LANE LAW: trim the SOLIDS out of the wrap band, not the wrap out of
the silhouette — the overlapping hull flank faces inside the track
band are interior geometry (the wrap paints those silhouette columns
either way), so a clip of the loft's outboard lower flange to
x |≤1.42| across those z ranges, and a rack-lower-rail/flap-fill notch
above the wrap line (~0.436 @ z −3.585, the r10 bisect-law line),
should be MASK-INVISIBLE. The r10 bisect law stands: any rear-visible
NEW geometry below the idler-wrap line writes side-mask bottoms —
this order REMOVES volume, adds none. Done-gate: audit ≤60/≤60 (0
preferred) + gate 90.0 PASS ×2 + rear/left pairs show knobs clearing
the rack rails at 4×.

**GROUP 1 — gear-shade lane (driver A; all material/tone, zero mask
movement):**
- 1a. Lift the shaded chain/shoe floor from 24-30L to the ref's 35-45
  class (retone the chain/guide-horn dark buckets or their AO in
  shade). Done-gate: close-front [0..640]×[380..560] sub-30 census
  ≤200 (ref 0; currently 1995) with the wheel-window p5 ([150..205]×
  [392..428]) ≥45 (ref 52.9); no change to the lit shoe tops.
- 1b. REAR IDLER disc face + hub → dark-gear class (keep the FRONT
  sprocket's pale cover — that one is ref-true and cured the r8
  black-C). Done-gate: view-left stern disc zone reads ≤65L med
  (currently pale ~90+); close-rear pocket does NOT return (spot
  check dead-rear corners p5 ≥ current 46.5).
- 1c. Close the pale gaps in the wrap knob comb (link pitch/overlap
  or a dark backer strip INSIDE the existing wrap silhouette/AABB).
  Done-gate: stern 4× crop reads a continuous dark band around the
  idler like the ref; gate byte-line unchanged (interior edit).

**GROUP 2 — cast-vs-CAD lane (driver B; all material/tone):**
- 2a. Turret-flank relief: restore the missing quartiles in
  [330..560]×[270..330] (view-left): p5 ≤55 (ref 46.6) via real
  fitting under-shadows/recess darks; p75 ≥103 (ref 105.3) via
  top-lit crowns on flank fittings. No silhouette columns — interior
  faces and tone only.
- 2b. Ink consolidation: deepen a FEW real pockets to sub-38 (grille
  slots, fitting unders, basket slit floors; view-top zone target
  15-30 sub-38 px, ref 23) while LIGHTENING the diffuse hairline-seam
  network (sub-55 1169 → ≤700, ref 472; same treatment at close-roof:
  sub-45 168 → ≤80, ref 52). The ref's law: few deep shadows, not
  many faint lines.
- 2c. Mottle amplitude on the big fields: keel rear faces sd → ≥5
  (ref 8-9), glacis-top band med → ~87 / sd → ≥9 (ref 85.7/11.5),
  camo-bucket micro-mottle + AO variation only.
- 2d. De-draft the dome from above (3d cert-5 lesson): sun-asymmetric
  rim shading on the existing ring tori, kill the uniform drawn
  outline; done-gate = 3× toptilt/close-roof read "shaded cast mound",
  no double-circle.

**GROUP 3 — dead-rear void grammar (driver C/D; material first, then
priced hairline geometry):**
- 3a. MATERIAL: move the dark out of the bright band — retone the
  y290-330 pocket row floors to lit-kit class (≥70; ref's band reads
  p5 90/med 99.4), keeping ≤2 dark cells adjacent to the upper band.
- 3b. GEOMETRY (hairline, priced): open real air in y210-250
  ([260..380] window): curtain-rod extraSkips + hairline rods (the r7
  param mechanism measured gate-free) + ≥2px vane-crown dips between
  billows (the r4 lane-dip class, downward-only) + tarp-crown gaps.
  Target air ≥15% (ref 32.5%, currently 5.4%). PRICE EACH CUT against
  whole=90.0 ×2; certified side cols (falling rim 2.455→2.435, vane
  crown lanes) keep their max-over carriers; if the razor blocks past
  ~15%, land the partial and bank the residual.
- 3c. hero-rr highlight extension (r11 mechanism, silhouette-free):
  more lit rolls/strap crowns under min(packTop+0.030, topRear−0.048)
  + a lit rail-top segment class on the near frame, coverage ~40% of
  the window (r11 rolls cover ~15%). Done-gate: [420..500]×[325..385]
  p75 ≥88 (ref 99.5; currently 79.2), med ≥81; p95 stays ≤ ref 107.

**GROUP 4 — decoration/furniture (flush, zero-column, the r10
glacisKit class):**
- 4a. Lower-rear furniture fill on the flanking tail faces (x
  ±0.5..1.3, y 0.55..1.05 at the tail plane): pintle chain links,
  clevis mouths, hinge blocks, ≤+0.013 proud (sub-pixel to the side
  ortho), detail-tint. Done-gate: 3× dead-rear crop density reads the
  ref's fitting-jungle class; zero new gate columns.
- 4b. Corner flap-gap: brighten flap faces + add a gap backer INSIDE
  the existing silhouette (keelDarkTail material-split lane). Done-
  gate: [482..532]/[108..158] × [424..500] med ≥85 (ref 94.5), p5 ≥55.
- 4c. MG read polish (owner law: BOTH guns read): two-tone the boom
  MAG (pale top-lit crown where sky-backed from the rear quarters,
  dark rod with pale breaks per MG PHYSICS), deepen the .50 cradle
  gap darks so the crest bar parses as gun-over-roof from the sides.
  The free-sky float gap remains certified-blocked (dims p95 + dome
  z) — no order on it; documented as the honest cap.
- 4d. Bow hook + toe bracket detail-tint toward the ref's subtle
  class (close-front: the pale hook block is the brightest bow mass;
  ref's clevis is tone-merged).

## Residuals certified/priced this round (no orders)
- .50 free-sky float (dims-p95 + dome-z bind) — honest cap, carried.
- Dome crown proc-only arc + certified 2.630 flat band — sanctioned.
- Rim-cresting basket contents — razor-blocked at whole 90.0 (3b/3c
  precedent: the through-shadow gap closes only via 3b/3c-class
  geometry spend that this build cannot price; 3c graduated with its
  own version of this residual).
- Fender-nose edge Δ~8-12° watch items (gate-priced dims carriers).
- Front-view tunnel-through Δbot @ x ±1.58 (flap-gap projection;
  partially addressed by 4b's backer).
- mg0+0d §I owner call — orchestrator queue, 3-series precedent.

## Verdict

FAIL — best-ordered roadmap above. Floor 8.4 (hero-rearright), carries
8.5 across the rear quarters and closes, ceiling 8.7. Nothing here
requires silhouette spend except order 0 (mandatory, mask-lane-neutral
by construction) and 3b's priced hairlines; groups 1/2/3a/3c/4 are
material/tone/flush lanes — the razor bind is respected. Clear order 0
+ groups 1-2 and the rear grammar (3) and this build is a genuine
9.0-track candidate: its identity, registration, dims, and tone tables
are already graduate-grade; what stands between 8.5 and 9.0 is cast
surface truth and the dark grammar of the gear and the tail.
