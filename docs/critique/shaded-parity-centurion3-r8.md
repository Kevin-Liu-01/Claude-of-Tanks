# centurion3 shaded-parity r8 — GRADUATION ADJUDICATION, round 3 (2026-08-05)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=centurion3` →
shots/critic-centurion3/ (17:06, zero console errors; FIFO ticket lock
queued honestly behind the misc2 capture chain + the m45/m1a2 audit
train — ~25 min wait, no lock break). Byte-discipline: `tmp-hashgeo.mjs`
centurion3 = **bf0a45e8** (47 meshes / 74 828 verts) at campaign START
and END — exactly the d85b6a5 landing; family watch: centurion5
**a25a73b8**, chieftain5 graduate **5117b9a8** — both EXACT. Official
gate re-run: **91.1 PASS ×2 bit-identical** (hull 92.8 / whole 91.2
[front_whole 91.24] / turret 91.1 / stations 95.2 / dims 100 / floaters
100) — the round-3 landing line reproduced to the digit; turret_side
91.1 remains the razor. `visual-evaluator.mjs --id=centurion3`: exit 0,
**RIG PARITY OK** (max yawProxy 1.0° @front, all other orthos ≤0.7°;
world offset Δ(0, 0.023, 1.205) is registration data), evidence at
shots/visual-eval-centurion3/. Every tone window re-derived on MY fresh
pairs twice: via tools/tmp-uk-r8-gear-measure.py / tmp-uk-tone-measure.py
(the builder tools reproduce the r6/r7 critic rects verbatim) AND via my
own independent code (scratchpad c3r8-indep.py) — every number below
matches to the decimal between the two derivations. Zoom crops
diagnosis-only (scratchpad c3r8-crops/).

## HEADLINE: GRADUATION PASS — 9.0 EVERY VIEW (floor 9.0, ceiling 9.0). Dual gate met at hash bf0a45e8: geometry 91.1 PASS ×2 + critic ≥9.0 all fourteen. The program's 24th graduate — the Centurion line's first. §10 retirement to the orchestrator.

front 9.0 · frontleft 9.0 · left 9.0 · rearleft 9.0 · rear 9.0 ·
rearright 9.0 · right 9.0 · frontright 9.0 · top 9.0 · hero-fl 9.0 ·
hero-rr 9.0 · toptilt 9.0 · close-front 9.0 · close-roof 9.0

r6 → r7 → r8: floor 8.4 → 8.7 → 9.0. This is a bar-clearing graduation,
not a ceiling-buster: every view sits AT 9.0 on the graduate test — 1×
read same-vehicle-same-tier with no dominating residual, every 3×-class
residual carrying a certified owner, every machine gate green. The r7
prediction ("land W+X1+X2 with the gate held and the side/close views
reach 8.9-9.0; add X3/X4 inside the 1.1 headroom and this is a
9.0-every-view graduation candidate") is exactly what the round
delivered.

## Round-3 claims audit (§D: every number re-derived from MY fresh pairs)

| claim (d85b6a5 / packet r8) | my fresh measurement | verdict |
|---|---|---|
| W1 left band med 55.1, p95 61.9 (≤65), sd 4.2 (≤7; ref 4.4), sub30 0 | med **55.1**, p95 **61.9**, sd **4.2** vs ref 51.4/60.0/4.4, sub30 **0** | CONFIRMED — ref-parity; my independent ring-profile probe: proc luma swing 35.5 vs ref 34.4, dark line-work 120 px vs ref 181 — the pillow flatness is DEAD |
| W2 close-front band p95 71.8 = ref exactly | p95 **71.8** = ref **71.8**, med 61.5 vs 60.6, sub30 0/0 | CONFIRMED exact |
| Ring read at 4× | six wheel arcs with darker tire-rim rings + dark bogie gaps, olive polarity; bolt/hub circles sit physically behind the authored 0.60 hem | CONFIRMED within hem exposure (calibration ruling lane) |
| X1a/b/c casting blends silhouette-neutral, gate line held | gate ×2 bit-identical; hood-lap continues the cover onto the slab (visible close-front/roof); lintel band + side strips ease the punched recess top; forward caps grade the plate leading edge | CONFIRMED delivered |
| X1b ridge-rake WITHDRAWN (evaluator fall = shading edge; r5 2.732 cert exact) | the crown edge-pairing RELOCATED on my run: r7's +14.4 @(0.88, 2.57) is gone; the detector now fits **+19.4 ±0.3 (0.30 m) @(1.20, 2.39)** at the crown-to-wall shoulder — same physical family, re-paired after the caps landed; mask line gate-certified | CONFIRMED as-documented; residual re-registered (below) |
| X2 cupola relief, zero height | eight clip blocks read on the cone at 4×; 101° dark lid arc present; flat lid held (heights bit-identical via gate) | CONFIRMED — instrument arc-pairing still 0 (the relief is tone/relief, not a silhouette arc); drum-vs-ref ring breadth stays a watch |
| X3 flaps: front_whole 91.15→91.24, procBot 0.61-0.63 vs refBot 0.59, air 7.6/8.1 | gate front_whole **91.24**; evaluator front profile Δbot p95 **0.234 → 0.045 m**, the r6 flap flags (Δbot +0.973 @±1.63) GONE; air front **7.6%** / rear **8.1%** vs ref's own 5.5/7.6 | CONFIRMED — the ≤7 literal gate is met nowhere but the rear ref itself reads 7.6; residual localized: a corner notch x-cols 85..92, rows 430..467 (guard-to-flap corner), front +2.1 air pts vs ref, rear +0.5 |
| X4 no-geometry: authored 29.8° vs ref-fit 29.7°; flags = serration envelope | quarter flags persist TO THE DECIMAL (rearleft −13.1 ±0.7 / rearright +13.1 ±0.7, len 0.87/0.90); source r6 comment carries the 0.57/m (=29.7°) ref fit that contactZR −2.32 pins; my 3× dep-zone crops: the proc corner line sits at the ref's place — the read difference is the chunkier two-layer shoe serration | CONFIRMED — adjudication stands (c5 O10b texture-class precedent) |
| Y1 lamp faces | ring + smoked-glass face read at 3× in view-front/frontleft; the r7 black-rectangle read is gone | CONFIRMED |
| Y2 skirt-lip flush; hull +0.4 | hull row 92.4 → **92.8** ✓ (mask effect real). RENDER RESIDUAL: the plan skirt lines persist — top-view procOnly still carries 4 × len-5.37 lines @x ±1.61/±1.64 (r7: ±1.62/1.63) | PARTIAL — mask-delivered, tone seam remains (owner registered below) |
| Y3 tail dressing (c5 O5 recipe) | cable band + end cleats + spare-link chevrons present; the r6/r7 BARE-tail read is gone; drape reads darker/straighter than the print's lit swoop | CONFIRMED with note |
| Y4 slot floors, duffels untouched | bin row med 52.7 (duffel-owned, r7-adjudicated −2.3), sub45 100 held; slot shadows filled below the row | CONFIRMED as-scoped |
| r7 regression sweep | rear cols 57.3/57.3 sub30 0/0; deck ink 10/136/165 (ref 444/401/472); close-roof 3170 (ref 9967); blue chips **0/0**; face med 50.8 sub45 5544; front cols 52.7 (W3 optional, not taken) | ALL HELD to the decimal |

## Standing checks (§B + §D + §H.4)

- **TRACK CONTAINMENT: PASS, IMPROVED** — `track-clip-audit --exact`
  **0 front / 0 rear** (the r6/r7 documented 0/20 sprocket-graze is
  GONE — the X3 dial-2 rear inner edge at 1.560 cleared the pin-cap
  envelope). New-build target hit by a graduation candidate.
- **CONTIGUITY: PASS** — machine contig 0 (standard-check §B2 scan);
  evaluator holes 0 in 12/14 proc views; the two survivors are the
  SAME projection-gap micro-voids as r6/r7 at identical coordinates
  (hero-rr 0.029 m² @(−0.64, 2.49, 1.00); close-roof 0.014 m²) and the
  REF ITSELF carries four of its own in close-roof; border-cut chains
  stayed under borderClips (§D — no orders at them).
- **§B1 SLOPES / NO-STAIRCASES / SLOPE-MASS: PASS.** Glacis one-rake
  at 1× (lower-front flags +6.6 ±0.5 detail class); turret cheeks
  rake; plan-front de-step holds (converging diagonals at 3-4×, no
  notches — re-verified this round); the r7 crown cluster (the LAST
  §B1 item) is DELIVERED per X1 with the residuals re-registered
  below as shading-class, mask-certified.
- **§B3 DECORATION + MG PHYSICS + NO-MYSTERY-BOXES: PASS** — census
  mg1+0d (FITTINGS.pintleMG MAG, §H.4 tell; hand-authored dressing
  carries the packet justification). Two-tone MAG correct on the pale
  deck (crown-riding dark lines). Mystery-box sweep at 3-5×: every
  r8 addition reads as its named thing — lintel/lap = casting/canvas
  attached to their masses, coamings = slot furniture, cable + cleats
  + chevrons = §B3-told tail kit, lamp rings = lens tells, clip
  blocks = cupola fittings. The r7 flag (black lamp face) is CURED by
  Y1. No bare cuboids near mantlet/gun root/armor faces.
- **§B5 TURRET FURNITURE PARENTING: PASS** — stranded 0 / abutting 0
  / dangling 0 (no re-parenting this round; floaters 100 ×2).
- **§B6 TRACK RUN \\____/: PASS** — both end wheels raised, both
  ramps read, trapezoid correct; authored departure tangent 29.8° vs
  the gate ref's own 29.7° fit (X4). The quarter-view ±13.1° flags are
  the projected shoe-serration envelope (texture-class, adjudicated).
- **Flood blue-signature: CLEAN** — 0 px both halves, close-roof full
  frame (2b held).
- **Off-palette sweep: CLEAN** — the strongest warm probes: bustle
  box edges r−b max +11, hull rear corner +19, control zone +23 — all
  r−g NEGATIVE (green-dominant khaki edge-light), inside the r7
  certified ≤+23 family; the ref's own bustle zone probes +13.
- **§H.4 VARIANT-DISTINCTIVENESS: PASS** — fresh 3-up strips (my c3
  pairs; c5 same-day pairs; chieftain5 frozen pairs, hashes verified):
  (1) c3 SHORT low bustle vs c5 long walled bustle; (2) slim 20-pdr
  with root collar vs fat L7 with top-offset mid-tube drum; (3)
  two-tone MAG vs dark M2 (c5 O10a); (4) c3 tan hood vs c5 olive
  hood; (5) c3 LOW TRIPLE smoke bins vs c5 2×6 cheek banks with O8
  mouth rows; (6) c3 flat-lid cupola + 101° arc vs c5 domed cupola
  (O3c); (7) c5 weave panel with slat hints; (8) chieftain5
  unmistakable (needle nose, twin masts, exposed run). No re-badge
  read at any of the four strip views.
- **CIRC/ARCS: residual-as-watch** — instrument arc pairing remains
  0/14 (ref presents 1-3 arcs per view); the X2 lid arc + clip relief
  and Y1 lamp rings answer the cupola and lamp classes as TONE/RELIEF
  grammar (visible at 3-4×), not silhouette arcs; W1's rim rings give
  the wrap zones their ring read. The ref's cupola remains a broader
  dished ring than the proc drum — watch, interior to plan masks,
  never flagged by any round as a gate item.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier" — the graduate test: 1× dominant-residual-free, every 3× residual owned)

- **view-front 9.0** (was 8.8) — the three loudest r7 holders are
  dead: flaps hang at ref depth (Δbot p95 0.045 m), the mantlet
  recess top is eased by the lintel, lamp rings read. Cols med 52.7
  (−5.0 vs ref L, honest; sub30 1); face med 50.8 (−2.6, honest).
  Owned residuals: crown-to-wall shoulder +19.4 ±0.3 (0.30 m,
  1×-invisible, mask line gate-certified); hood highlight +20L local
  (cloth class); air corner notch +2.1 pts vs ref (sky-side, priced).
- **view-frontleft 9.0** (was 8.8) — hood-lap covers the old free
  corners; lamp ring reads; wheels read as wheels at angle. Ramp
  −9.8 = serration texture (owned); fender-line +4.6/+8.9 detail.
- **view-left 9.0** (was 8.7) — the W1 class driver is DEAD at
  ref-parity (sd 4.2 vs ref's own 4.4; p95 61.9); tables parity
  throughout; trapezoid + two-layer track honest. Remaining: wall-box
  top-edge crispness (2-3× note, print carries drawn edges of its
  own); guard/flap line +7.0 ±0.8 (0.34 m, real-small).
- **view-rearleft 9.0** (was 8.7) — wrap horseshoe olive; shelf
  courses honest; Y4 lids toned. Ramp −13.1 = owned texture class;
  sprocket zone now carries the ringed berry-disc read.
- **view-rear 9.0** (was 8.7; r6's 8.4 floor) — columns REF-PARITY
  (57.3 vs 58.8/60.1, sub30 0/0, air 8.1 vs ref's own 7.6); tail
  DRESSED (cable + cleats + chevrons — the bare-plate read is gone);
  bin row sub45 100, med duffel-owned (protected). Note: cable reads
  darker/straighter than the print's lit drape.
- **view-rearright 9.0** (was 8.7) — mirror of rearleft; +13.1 owned.
- **view-right 9.0** (was 8.7) — as left mirrored; crown line +9.0
  ±0.6 (0.71 m) = the crown roll-off shading class (owned with X1b).
- **view-frontright 9.0** (was 8.8) — as frontleft; crown +12.7 ±0.8
  (0.34 m) persists = the flat-vs-cast-roll shading residual, mask
  truth certified by the measured-withdrawn rake attempt (r5 2.732
  side cert exact).
- **view-top 9.0** (was 8.9) — footprint superb (p95 Δtop 0.073 m,
  yawProxy 0°); deck ink CLEANER than print at parity medians; plan
  front one curve at 3-4×; flap plan slivers ride the ref's own
  skirt-zone lines. Carried: the Y2 skirt seam lines persist
  (procOnly 4 × 5.37 m @±1.61/1.64 — mask-delivered, tone-residual,
  owner below); procOnly panel clutter 24 (r7-class); chordal-vs-pear
  nose at ≥8× only. CRITIC ORIENTATION NOTE for the record: in the
  critic top pair the BOW is at image BOTTOM (gun overhang tells) —
  the turret-REAR furniture stack (duffel row / slot shadow / shelf
  tiers) sits image-TOP and must not be misread as a turret-front
  staircase; it is layered real equipment, the r7 grammar-density
  class, not §B1 quantization.
- **hero-frontleft 9.0** (was 8.8) — the garage read is RIGHT and
  now clean at the gear line; horn fin, stance, slim tube, hood.
  Crown −8.5 (0.81 m) = the cast-roll shading class (owned).
- **hero-rearright 9.0** (was 8.7) — tail composition dressed; Y4
  slot fill reads; duffel slab honest-pale (protected). Ramp +12.0 =
  owned; crown pair −7.0/+8.6 = owned.
- **hero-toptilt 9.0** (was 8.8) — ink stamps gone, furniture toned,
  X1 lap/caps blend the face stack. Carried: plate/box grammar
  density vs the lumpy cast print (the standing graduate-class note;
  same family the m47/merkava3d packets carry); crown −11.4 at the
  §D sub-0.25 noise floor.
- **close-front 9.0** (was 8.7) — W2 band p95 71.8 = ref EXACT;
  muzzle/collar/horn excellent at 4×; recess softened (lintel + side
  strips); Y1 lens + rim read. Carried: hood highlight (local);
  discharger mouth tell weak from front (r7-certified note; mk5 O8
  recipe exists if ever ordered); fender line +5.3 ±0.1 over 3.09 m
  (r7-certified real-small, exact repeat).
- **close-roof 9.0** (was 8.7) — blue 0; MAG mass + polarity right;
  cupola relieved (clips + arc); hood-lap continues onto the casting;
  lids toned (Y4). Carried: roof rear-line −5.5 ±0.1 over 1.47 m
  (EXACT r7 repeat — the mask-certified turret table, a20e801
  boundary class, reads slightly flatter toward the bustle at 2×);
  cupola breadth watch; crown grammar density.

## Residual register (all owned; carried into the graduate packet)

1. Crown/wall shading cluster: front +19.4 (0.30 m, re-paired), fr
   +12.7 / cf −11.7 / right +9.0 / hero-fl −8.5 / roof −5.5×1.47 —
   the cast-roll-vs-flat-plate shading family; mask lines certified
   (r5 2.732 side cert + a20e801 + the measured-withdrawn rake).
2. Quarter-view ±13.1 departure flags — shoe-serration envelope
   (X4 tangent math 29.8 vs 29.7; c5 O10b class).
3. 1d air: front +2.1 pts vs ref (corner notch, cols 85..92 rows
   430..467), rear +0.5 — priced, silhouette parity held elsewhere
   (front Δbot p95 0.045).
4. Y2 tone seam: 4 plan skirt lines @±1.61/1.64 persist — family
   recipe order if ever re-opened: tone the trim/skirt-top boundary
   (the flush-tuck moved masks +0.4 hull, not the drawn seam).
5. Hood highlight +20L local; tan hood pale vs print's camo canvas —
   cloth family, windows green.
6. Cupola drum vs ref dished-ring breadth — interior-to-mask watch.
7. Cable drape reads dark-straight vs lit swoop; W3 front-col med
   −5.0 (optional order, not taken); wall-box/skirt-tab crispness;
   duffel-owned bin med −4.8 (verdict-protected); zb −0.82 AA-class;
   vane p95 anchor; station-0 trim; gun-run ±0.03; projection-gap
   micro-voids ×2 — all r6/r7-certified classes, carried unchanged.

## Law-bank notes (for BUILD-STANDARD/critic procedure)

- CRITIC TOP-PAIR ORIENTATION: bow = image BOTTOM in tmp-tank-critic
  top views — verify with the gun overhang before ordering plan-front
  geometry (a bow-up assumption fabricates turret-front findings from
  turret-rear stowage).
- EDGE-PAIRING RELOCATION: when an ordered piece lands at a flagged
  zone, the evaluator re-pairs and can print a NEW larger Δ at a
  neighboring edge (+14.4 → +19.4 here). Diff coordinates against the
  prior round's report before treating it as a regression.
- TONE-SEAM ORDERS NEED TONE GATES: Y2's geometry flush delivered its
  mask points but left the drawn seam — a plan double-edge order
  should carry a procOnly-line done-gate, not only a mask row.

## Verdict

**GRADUATION PASS.** Floor 9.0, every view at the bar, zero machine
failures, all six §B laws green, §H.4 tells hold, off-palette clean.
Dual gate met at **bf0a45e8** inside a bit-identical **91.1 PASS ×2**:
r7's two remaining classes (W ring grammar, the X1/X2 casting cluster)
are dead or delivered-with-owned-residuals on my rig, X3 landed as a
measured gate GAIN (91.24 front_whole, clip 0/0, Δbot cured), X4 closed
with packet math my crops corroborate. Recommend the orchestrator run
§10 (three override maps + freeze at bf0a45e8) in the same commit —
**the program's 24th graduate, the Centurion line's first.**
