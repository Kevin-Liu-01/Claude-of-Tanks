# leo2a5 shaded-parity r10 — GRADUATION ADJUDICATION (2026-08-04, post-r10; prior verdicts r5 7.7 / r6 8.4 / r8 8.7)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2a5` →
shots/critic-leo2a5/ (zero console errors). Byte-discipline:
`tmp-hashgeo.mjs` leo2a5 = **bc9bad30** (the r10 landing hash eeef4bf,
141 meshes / 145168 verts) — verified BEFORE rendering and re-verified
AFTER the full campaign, byte-identical. Working-tree diffs
(modern3.js — another lane) do NOT touch the a5 build: leopard.js /
userdrops5.js / kit.js / tankFactory.js / materials.js all HEAD-identical.
The deckEq knob is ON in the shipping spec row (userdrops5.js leo2a5
`visual.bakeDirtDeckEq: true`) — every render here is the knob-on
shipping state. Graduates frozen on my watch: leo2a6 **80b76338**,
kf51 **77020c58**, leo2_revolution **f6a1d3c0** (checked twice, before
and after renders). Official gate re-run by me: **min 90.8 PASS ×2
bit-identical** (hull 90.8 / whole 91.0 / turret 91.6 / stations 94.3 /
dims 100 / floaters 100 — the r10 turret +0.1 confirmed).
`track-clip-audit --exact`: **front 0 / rear 0**. `turret-parent-audit`:
**stranded 0 / abutting 0 / dangling 0**. `tank-standard-check`: gate ✓
clip ✓ contig 0 ✓ decor **mg0+4d** ✗-census (the standing §I packet
carry, unchanged — hand-authored MGs predate KIT.fittings; visual MG
read adjudicated below). `visual-evaluator.mjs --id=leo2a5`: exit 0,
**RIG PARITY OK** (max yawProxy 1.5° @close-front, no skew flip);
wedge-crest/rack-line/hero-flag Δ family (+12.7/−10.3/+12.3/−14.7/
+14.8/+11.1/+13.7 class) = the certified cite-only carriers, values
unchanged within noise; top Δbot 1.660 m vertical-cliff class carried;
hero-rr 1.123 m² + toptilt 6.323 m² voids re-verified as projection air
(my blue-signature census below). Evidence: shots/visual-eval-leo2a5/ +
shots/critic-leo2a5/crops-r10critic/. Measurements: every r10 window
re-derived on MY fresh pairs (tools/tmp-a5r10crit-measure.py — stats +
over-threshold BLOB MORPHOLOGY, the speckle/edge discriminator; crops
tools/tmp-a5r10crit-crop.py, diagnosis-only).

## HEADLINE: PASS — floor 9.0, EVERY view ≥9.0 (mean ≈9.04) → GRADUATION RECOMMENDED (dual gate met at hash bc9bad30); all three banked windows + the deck-knob caution adjudicated NON-BLOCKING under the r8 precedent test

front 9.0 · frontleft 9.0 · left 9.1 · rearleft 9.0 · rear 9.1 ·
rearright 9.0 · right 9.1 · frontright 9.0 · top 9.0 · hero-fl 9.0 ·
hero-rr 9.0 · toptilt 9.0 · close-front 9.0 · close-roof 9.1

The ladder closed on schedule+1: 7.7/8.0 → 8.4/8.55 → 8.7/8.75 → 9.0
floor. The r8 verdict's single remaining 1×-visible driver — the
tier-stack lit-edge "layer cake" — is verifiably dead: my roofline
9-band alternation reads **2.31 vs ref 2.63** (proc now calmer than the
print; r8 alternated above it), and at 1×/2×/3× on left/right/hero/
close views the tier steps read as camo-continuous armor plates with
DARK rim bands — no pale roofline run, no >2px lit rim at close-front
2×. Builder self-read (~8.7 floor, bar not claimed) is honest and
conservative; I land +0.3 above it exactly where the banked-window
dossiers proved non-blocking ON THE RENDER — the same adjudication
shape the r8 verdict applied to gear-sub45 and 2c-p75.

## r10 claims audit (§D; every number re-derived on my fresh pairs)

- **1a TIER-EDGE RIM QUIET — the visual driver CONFIRMED DELIVERED**:
  roofline alternation **2.31** (builder 2.29, ref 2.63) — at/below the
  print. view-left/right 1×: massed roofline with kit silhouettes, no
  continuous pale run ≥40px. close-front 2×: tier edges carry dark rim
  bands + camo continuity; the apron kills the exposed shadow-wall
  strip; quilting reads as offset plates, not a bright stripe. Crown
  window: see banked-window adjudication 1. Rear med **82.4** (82..88
  ✓, ref 86.4) held with louvre-tex rowmean-sd **5.89** ≥4.5 ✓
  (ref 6.41) and vgrad 3.73 ≈ ref 3.56.
- **1b SHROUD-FACE TINT — CONFIRMED**: close-roof/close-front crops
  show no untextured grey plate run — EMES hood, launcher backdrops,
  dip-zone fill all carry the position-planar camo overlays; the r8
  "flat grey at 4×" hold is closed. Roof windows no worse (deck med
  56.6 knob-on, turret-side p95 84.4 = ref 84.4 exactly, ≥83 ✓).
- **2a GLACIS GRAIN — banked honest miss, IMPROVED in shipping state**:
  my fresh rowmean-sd **6.71** vs the ≤6.0 order (dossier quoted 7.72
  knob-off; the deckEq lift evidently calms the bow-top rows — a
  favorable knob interaction the A/B's med/hue-level "identical" read
  did not resolve). med **65.8** ≤66 ✓, hue **67.8** family ✓, sd 10.86
  (ref 6.33), front-face ladder **5.75** = the banked pad-shadow floor
  exactly. On the render the residual is the documented beak/wing-band
  physics split (under-wing shade + sky-facing bow tops + certified
  gun-chin rows); the anti-slip fields read as two CAD-plain dark
  rectangles vs the ref's woven X-fields at 2-3× — print-variance
  grade, invisible at 1×. See banked-window adjudication 3.
- **2b SLAT + PATCH DE-CAD — CONFIRMED**: 4× rear crops show notch/bite
  irregularization on the crossing patches (red-left carries a corner
  bite, olive-center a bottom notch), ≥3 patches still cross the band
  at 2×, boxes keep ≥3 tones + skins; rear med 82.4 ✓ rowmean-sd 5.89
  ✓. Residual: proc slat pitch coarser than the ref's fine louvres at
  3×+ (geometry class, non-blocking, carried).
- **2c WHEEL-FACE RINGS — CONFIRMED**: 4× view-left crops show the
  two-tone washer read on all faces behind the comb (dark tire annulus
  + lighter rim ring + dark hub); at 2× the wheels read ringed, closing
  the r8 "flatter than ref's ribbed rims" hold. Done-gates all on my
  windows: gear hue **59.3** ≥50 ✓, corner ladders **3.96/4.00** ≤4.0
  ✓, gear sub45 **2576** = the post-f243966 fleet baseline EXACTLY
  (ring cost 0 as claimed), strip-law med ratio **1.112** (0.92..1.16
  ✓, 67.3 vs ref 60.5).
- **2d LAUNCHER BRISTLE — DELIVERED-within-certified-envelope**:
  frontright 2×: the tube row now bristles over the cheek line with
  pale end rings — the r8 ✗ quarter is fixed. close-roof: 4 tubes read
  unmistakably. rearleft/rearright 1-2×: nub rows visible. frontleft
  2×: still marginal (nubs crest, full row occluded) — the SAME r8
  marginal-✓ read; the packet's reverted +0.010 push proves the real AA
  boundary bites at ~1.396 (+0.016 errM), so the placement is
  gate-priced. dims 100 held ✓, no new columns ✓. Not a floor item
  (r8 pre-classification stands); residual carried certified.

## The FOUR adjudications (the question this verdict exists to answer)

The r8 precedent test, applied verbatim: a banked window clears iff
(i) the mechanism is documented and reproduces on MY windows, (ii) the
residual is invisible-as-defect at game scale (1×/2×), (iii) the class
is untunable-pair / physics-bound / gate-priced rather than unfinished
work. All four items pass all three prongs.

1. **crown p95 95.0 vs ≤92 ordered (ref 89.3) — NON-BLOCKING.**
   Reproduces the dossier (94.9 → my 95.0, +0.1 noise). My blob census
   localizes the >92 population exactly where the dossier's markers put
   it: the weathered-canvas SKINS seen at grazing between the bustle-
   rack slats (29px/24px vertical LINE components at x489/x466) plus
   the stern-box grazing face (327px patch at [554..600]×[363..384]) —
   the fleet deep-shade rim term (0.45·rim·shade, materials.js
   vehFloorL) flooring grazing shaded surfaces to ~107-118 sRGB
   albedo-independently. The paired-knob wall is consistent with my
   reads: the same skins carry rear med 82.4 (in-gate), matching the
   documented slim-cut teleport to 78.4. VISIBILITY: at 1× the rack
   reads as loaded stowage — no defect; at 2× the gaps read as pale
   canvas/straps, plausible kit; the ref's own window carries a
   234px/19-blob bright family in the same corner. KNOB-INTERACTION
   FINDING (document, do not re-cite the old number): the shipping
   knob-ON state reads **over100 484** where the knob-off dossier
   quoted ~30 — the deckEq lift pushed the window's bright tail hotter
   while killing its dark tail (sub45 620 → **313**, my read exact).
   Same mechanism class, same game-scale read, p95 unmoved; the ~30
   figure is retired, 484 is the number of record at bc9bad30.
2. **2c p75 67.9 vs ≥68 hold — NON-BLOCKING.** Reproduces exactly.
   −0.1..0.2 of the hold, smaller than the −0.8 of the same
   camo-boundary class the r8 verdict cleared; the canvas lever's
   exhaustion trade-log (2 steps +0.3, then 0) is credible; on the
   render the under-bustle reads correctly (dark pockets, lifted
   plateau, toned crowns, med 57.4 vs ref 60.5 in-family).
3. **glacis rowmean-sd 6.71 vs ≤6.0 ordered — NON-BLOCKING.** The
   shipping state beats the dossier (7.72 → 6.71); med/hue gates held;
   both reverted mechanism cuts (beak lift panel dirt-bias inversion;
   field retones on the corrected row anchor) are documented with the
   fleet laws banked; the residual row families are the r8-certified
   ~5.5-6.0 split carriers plus this print's lighting. At 1× the
   glacis is clean; the 2-3× anti-slip grammar delta is print-variance
   grade, not a tier read.
4. **deck knob over92 72 → 154 (ref 29) — NON-BLOCKING, KNOB STAYS
   ON.** Morphology settles the speckle question: the population is
   4-5 lit panel-EDGE lines (1px tall, 14-22px runs at the two plate
   boundaries y139/y213), one 52px soft corner gradient at a plate
   edge, and 5 sub-3px dots — there is NO speckle field (the ref's own
   29px is organic brush-streak specks). At 1× invisible-as-defect; at
   2× it reads as crisper panel edges — the already-carried ruled-line
   deck grammar, not a new class. Against it: deck med 56.6 (ref 59.9,
   knob-off 54.6), deck sub45 1222 (knob-off 1729, ref 909), hero-rr
   sub45 313 (knob-off 620) — knob-ON is the closer-to-print state on
   every mass statistic. Recommendation: ship ON, exactly as landed.

## Standing checks (§B + §H.4 + owner laws)

- **§B4 TRACK CONTAINMENT: PASS** — `--exact` 0/0 re-run by me; no
  tooth-over-plate at 4× (rear corner crop shows the legal two-layer
  comb behind the flap line).
- **§B2 CONTIGUITY / NO EMPTY AREAS: PASS** — machine contig 0; my
  blue-signature enclosed-air census (maxch ≤13 AND B−R ≥ +8), full
  frames: close-front proc **1px** (ref 103), view-top proc 8px (ref
  99), hero-toptilt proc 5px (ref 360), view-rear proc **0px** (ref
  125), close-roof proc 511px in thin-rod pockets vs ref's own 940px —
  proc ≤ ref everywhere, zero in-body components ≥6px on the hole-law
  views. The evaluator's 1.123/6.323 m² voids remain the certified
  merkava-class tilt-projection air.
- **§B1 FRONT SLOPES: PASS** — front 27 matched, worst Δ−5.7° (the r5
  skirt-top family, gate-priced); glacis rake follows the ref; wedge
  cheek rake correct in side/3-4 views.
- **§B5 TURRET PARENTING: PASS** — audit 0/0/0; floaters 100 ×2
  in-gate; bustle rack, skins and launchers all yaw-side.
- **§B6 TRACK RUN: PASS** — \\________/ trapezoid both sides: raised
  idler AND raised covered sprocket, approach/departure ramps read.
- **§B3 DECORATION/MG: PASS (visual), census carry documented** — two
  MG3s (loader pintle; stowed diagonal with receiver lump readable at
  top 2-3×), rod-over-frame mass at rear 2×, launchers ×2, X cables,
  jerry blocks, KIT.spareTrackLinks strips (the 4d census); mg0 census
  is the standing §I carry — unchanged this round, packet-justified.
- **ROUNDNESS (§D)**: hatch rings round + concentric at 4× (close-roof
  crop), PERI cap concentric, sprocket disc round olive-flat (p95 76.9
  ≤80 ✓, med 53.3), fan wells recessed true arcs; evaluator arc digest
  carries only the known refOnly carrier arcs — no facet/polygonal
  flags on proc.
- **§H.4 VARIANT DISTINCTIVENESS: PASS vs all three, fresh grids**
  (crops-r10critic/h4-*): vs **a6 80b76338** — a5 covered gear + comb
  + stern disc + louvre stern vs a6 exposed spoked wheels, L/55 sleeve
  steps, clean stern; vs **kf51 77020c58** — kf51 mast + triple whips
  + tall rounded turret; vs **revolution f6a1d3c0** — full-height slab
  bays + sensor-tower turret + black band. Garage-glance distinct; no
  re-badge read.
- **FILL/CIRC (owner top-down law): FILL PASS** (top census 8px, no
  enclosed cells) **/ CIRC PASS** (fans, hatch rings, disc).
- Fleet-interaction verification: gear sub45 2576 = the f243966
  baseline exactly (zero leopard-side drift since landing); taillight
  window p95 81.6 vs ref 83.2 (the r8 96.1 cable-crossing read is
  gone — improved, no order).

## Per-view justifications (bar ≥9.0 "same vehicle, same tier")

- **front 9.0** (8.8): flaps one covered mass (ladder 5.75 at the
  banked floor), glacis calm at 1× with med/hue in-family, launchers
  bristle both cheek lines, wedge raked, tier steps behind the wedge
  seam DARK. 2× residuals are grammar-grade only (anti-slip rectangles
  vs woven fields, certified comb lip).
- **frontleft 9.0** (8.7): cheek tiers camo-continuous, no lit edges,
  de-banded quilting; launcher marginal from this quarter — gate-priced
  envelope, documented. Nothing holds at 1×.
- **left 9.1** (8.8): roofline alternation below ref, wheels ringed,
  disc flat, strip law in-window, hull/turret side meds in-family. The
  under-skirt deep-shade band = banked floor class, reads as shade.
- **rearleft 9.0** (8.7): louvre facade + frame + ring + covered
  corner + disc; launcher nubs read; rack ribbing regularity at 3×
  and corner +6.6 warm at 4× are the carried prices.
- **rear 9.1** (8.8): band med 82.4 with ≥3 crossing notched patches,
  4-tone boxes + skins, X sweep to the guard rings, ladders AT the
  4.0 gate, Y-508 plate, taillights improved. Slat-pitch coarseness
  only at 3×+.
- **rearright 9.0** (8.7): mirror of rearleft; rack-line carrier flag
  unchanged (certified family).
- **right 9.1** (8.8): as left, mirrored; roofline massed, no bar.
- **frontright 9.0** (8.7): the r8 weak-quarter launcher now reads at
  2× (rings + crowns); otherwise as frontleft.
- **top 9.0** (8.7): deck med −3.3 vs print (was −5.0/−5.3), fans
  spoked, link strips, MG diagonal readable at 2-3×, fill clean, zero
  enclosed air. Hold review: ruled-line grammar + the knob's 4-5 lit
  panel edges — adjudged build-style/factory-fresh vs weathered print,
  tier-preserving; every deck mass statistic moved TOWARD the print
  this round.
- **hero-frontleft 9.0** (8.7): identity strong, tier steps carry camo
  at the roof rear, launcher cluster visible, straps/skins read.
- **hero-rearright 9.0** (8.7 — the historical floor): the r8 driver
  (tier bar) is dead — the roofline masses; the crown-window residual
  = rack-gap skins + box grazing face, rim-floor class, reads as
  loaded stowage at 1× and plausible pale kit at 2× (adjudication 1);
  p75 −0.1 (adjudication 2). Rack ribbing regularity carried.
- **hero-toptilt 9.0** (8.7): deck coherent under tilt, fans shaded,
  zero in-body air, camo crosses the plate grammar; ruled lines carry.
- **close-front 9.0** (8.7 — the r6 floor): tier rims dark-banded (no
  >2px lit rim at 2×), apron closes the step seam, shroud faces
  tinted, glacis calm, mantlet round-over-round, slit-zone still
  closed (census 1px). At 4× the plate-stack grammar vs the print's
  fused wedge remains — softened, print-variance grade.
- **close-roof 9.1** (8.8): hatch rings concentric, PERI two-tone,
  launcher tubes read as tubes, panel tints kill the grey runs,
  quilting offset-plates read; plate-seam grammar only at 4×.

## Residual register (carried, certified, or documented — none blocking)

crown-window bright tail (rim-floor × skins; over100 484 knob-on at
bc9bad30 — the number of record); 2c p75 67.9 (−0.1 boundary); glacis
rowmean-sd 6.71 (beak/wing physics split; knob-improved); deck ruled
lines + panel-edge over92 154 (knob grammar); gear sub45 2576 (fleet
floor baseline); gear/corner warm +6.6-6.8 (ladder pairing price);
front-face ladder 5.75 (pad-shadow floor); slat pitch at 3×; launcher
frontleft marginal (AA boundary 1.396); disc-face uniformity at 4×;
carrier Δ flag family + top Δbot 1.66 cliff + 1.123/6.323 m²
projection voids (evaluator-certified classes); mg0+4d census carry
(§I). Any future geometry edit invalidates this verdict per §G.

## Verdict

**PASS — floor 9.0, every view ≥9.0. GRADUATION RECOMMENDED** (the
program's 20th graduate per the orchestrator's ledger): dual gate met
at hash **bc9bad30** — geometry min 90.8 PASS ×2 bit-identical re-run
by me, independent critic ≥9.0 on all 14 views, machine battery clean
(containment 0/0, parenting 0/0/0, §B2 zero in-body, rig parity 1.5°,
graduates frozen and byte-stable through my campaign, §H.4 distinct).
All three banked windows and the deck-knob caution clear the r8
precedent test with mechanisms verified on my own fresh windows; the
knob ships ON. Orchestrator: run GEOMETRY-GATE.md §10 (three-map
registration retirement + turntable eyeball) against THIS hash in the
graduation commit; the knob-interaction finding (over100 484 of record,
dossier ~30 retired; glacis 6.71 of record, 7.72 retired) belongs in
the packet's r10 addendum at landing.
