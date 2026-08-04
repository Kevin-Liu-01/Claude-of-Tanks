# leo2a5 shaded-parity r8 — THIRD ADJUDICATION, graduation-track candidate (2026-08-04)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2a5` →
shots/critic-leo2a5/ (zero console errors). Byte-discipline:
`tmp-hashgeo.mjs` leo2a5 = **50c34724** (the r8 landing hash 2f0739b,
122 meshes / 136672 verts) — verified BEFORE rendering and re-verified
AFTER the full render campaign. Working-tree diffs in abrams/merkava/
patton/tankFactory/modern3 do NOT touch the a5 build (hash byte-identical
to HEAD landing). Graduates frozen on my watch: leo2a6 **80b76338**,
kf51 **77020c58**, leo2_revolution **c5d9e131** (checked twice, before
and after renders). Official gate re-run by me: **min 90.8 PASS ×2
bit-identical** (hull 90.8 / whole 91.1 / turret 91.5 / stations 94.3 /
dims 100 / floaters 100 — the r8 whole 91.1 confirmed). `track-clip-audit
--exact`: **front 0 / rear 0**. `turret-parent-audit`: **stranded 0 /
abutting 0 / dangling 0**. `tank-standard-check`: gate ✓ clip ✓ contig 0 ✓
decor **mg0+4d** ✗-census (standing §I packet carry — hand-authored MGs
predate KIT.fittings; the 4d are the r8 KIT.spareTrackLinks strips, the
build's first library fittings; visual MG read adjudicated below).
`visual-evaluator.mjs --id=leo2a5`: exit 0, **RIG PARITY OK** (max
yawProxy 1.5° @close-front, no skew flip), wedge-crest Δ+12.5/−13.8 and
rack-line Δ+10.6/+12.2 = the r5/r6 cite-only carriers unchanged, top
Δbot 1.66 m vertical-cliff class carried; evidence at
shots/visual-eval-leo2a5/. Measurements: the full r5+r6 window set
re-derived on MY fresh pairs (tools/tmp-critic-a5r5-measure.py +
tmp-a5r6crit-extra.py, verified content); zoom crops diagnosis-only
(tools/tmp-a5r8crit-crop.py → shots/critic-leo2a5/crops-r8critic/).

## HEADLINE: FAIL — floor 8.7 (seven views), mean ≈8.75, ceiling 8.8; no view at the 9.0 bar; NO machine-gate order (gate ×2 clean, containment 0/0, §B5 0/0/0, contig 0-in-body); ONE coherent visible driver remains: the TURRET TIER-STACK lit-edge read

front 8.8 · frontleft 8.7 · left 8.8 · rearleft 8.7 · rear 8.8 ·
rearright 8.7 · right 8.8 · frontright 8.7 · top 8.7 · hero-fl 8.7 ·
hero-rr 8.7 · toptilt 8.7 · close-front 8.7 · close-roof 8.8

The ladder holds its slope: mean 8.0 → ≈8.55 → ≈8.75, and the r6 floor
pair (hero-rr 8.4, close-front 8.4) moved +0.3 each. EVERY r6 order was
delivered or honestly banked — all ten done-gate claims reproduce on my
own fresh windows within noise, and the two banked misses are mechanism-
documented and invisible-as-defects at game scale (adjudicated below).
Builder self-read (floor ~8.6, rest 8.7-8.8) is honest; I land ON it,
+0.1 on hero-rr where the banked windows proved non-blocking on the
render. What separates the build from 9.0 has collapsed from a tier of
classes to essentially ONE 1×-visible read — the turret roof/cheek
plateau renders as stacked slab tiers with pale lit edges (a "layer
cake" bar along the roofline) where the print carries one low smooth
crown — plus a short tail of 2×-scale grain items. Round 3 of the
projected 3-4; one strong tone-side round from the bar.

## r8 claims audit (§D; every number re-derived on my fresh pairs)

- **1a STERN BOXES DE-CAD — CONFIRMED, gate MET**: rear window
  [100..540]×[312..372] med **82.5** (gate 82..88, ref 86.4; r6 was
  91.9 hot), rowmean-sd 5.93 ≥4.5 ✓ (ref 6.41), vgrad 3.68 ≈ ref 3.56.
  At 2× the boxes carry 4 tones (canvas skin ~86-90, camo-red, deep
  olive, dark straps); the r6 "two pale CAD boxes" read is dead. At 3×
  the patches read as geometric capsules on flat canvas (order 2b).
- **1b PANEL TINT — CONFIRMED**: view-left turret-side p95 **83.5**
  (gate ≥83, ref 84.4 — closes banked 4c), med 73.7 vs ref 77.8;
  hull-side med **71.4** (ref 73.0, ±2 window ✓). GLACIS: med **65.8**
  ≤66 ✓, hue 39.5 → **67.8** (ref 72.0 family — the tone family now
  matches), rowmean-sd **7.73** partial vs ref 1.53 (mechanism-bound:
  gun-chin rows + plate-edge shade; sd 11.51 vs ref 6.33 still busier
  — order 2a pullback, not darkening).
- **1c COMB QUIET — CONFIRMED (hue + corners), sub45 banked**: gear
  window hue **59.3** (gate ≥50, ref 62.1) — the pale-grey AA sparkle
  along the ground runs is GONE (the r5/r6 complaint); rear-corner
  rowmean-sd **3.96/4.00** (gate ≤4.0 ✓, vgrad 1.16/1.12), front-face
  rowmean-sd **5.75/5.79** (order said "toward ≤5.5" — partial as
  claimed; vgrad 2.05, r6 2.34). Corner med **69.4** = +6.6 vs ref
  62.8 (the documented ladder-pairing price — visible at 3× as a
  slightly-olive corner, benign at 1×/2×). sub45 **2358** vs ≤1500
  gate — NOT met, banked: see visibility adjudication.
- **1d DISC CRESCENT — CONFIRMED, gate MET**: disc window p95 **76.5**
  (gate ≤80, ref 79.5; r6 was 89.8) with med 53.2 ≤65 ✓, p5 51.0 ≥45 ✓,
  hue 74.8 ≥55 ✓. The 4× crop shows an olive-dark cover disc with mud
  rim, no lit crescent. Residual: the disc face is more uniform than
  the ref's weathered wheel at 4× — cosmetic, no order.
- **2a LOUVRE CAMO BLEED — CONFIRMED**: 4 patches cross the band at 2×
  (2 inboard tilted + 1 per outboard facade); rear med in-gate (see
  1a); the r6 "+5.5 hot and UNIFORM" read is dead. At 3× the patches
  are capsule-shaped and the slat faces CAD-even (order 2b).
- **2b CABLE X SWEEP — CONFIRMED**: the X reads at 1×/2× with low ends
  landing AT the guard rings and passing in front, per the print. The
  taillight window p95 rose to 96.1 (ref 83.2) — the pale cable
  crossing in-window; class-consistent, no order.
- **3a MG READ HARDENING — CONFIRMED at top, adequate at rear**:
  top 2×/3×: the stowed diagonal MG3 carries a distinct receiver/grip
  lump mid-rod (x-top-mgdiag crop) — the deck's one honest diagonal
  parses as a GUN. rear 2×: rod-over-frame with a dark mass read
  (bustle-top crop). close-roof: the loader-MG assembly is present but
  subtle at 3× (pale-deck polarity inverts it per MG PHYSICS). ≥2
  views read GUN — owner-law §B3 standing check HOLDS (census carry
  documented; the r8 receiver additions are real and visible).
- **3b LAUNCHER BRISTLE — DELIVERED-PARTIAL**: per-tube pale end rings
  + caps at ~1.388 (inside the 1.41 column limit). Front-on and at
  close-roof the tube rows read as tubes ✓. From the quarters at the
  done-gate's own 2×: frontleft reads tube-ends/rings (marginal ✓);
  frontright reads a textured block, tubes only at 3× (✗) — the ref's
  clusters bristle OVER the cheek line at 2× from both quarters. Not a
  floor driver; hardening order 2d (~0.02 m certified headroom left).
- **3c ROOF-STACK SHROUDS — CONFIRMED, gate MET (full §D mask-method)**:
  my enclosed-air census (maxch ≤13 AND blue-signature B−R ≥ +8) on
  close-front: proc **92 px** vs ref **121 px**, and every proc
  component ≥6px sits in the header-text row (label letter holes) —
  ZERO in-body enclosed air; the r6 slit zone at (900-915, 218-225) is
  CLOSED. view-top/toptilt/rear proc: label-text only. close-roof:
  proc 549 vs ref 958 px — thin-rod pockets the ref carries MORE of.
  (The builder's 126-vs-140 numbers were maxch-only; with the blue
  term the conclusion is identical and cleaner.)
- **4a FENDER SPECKLE — CONFIRMED (§I library)**: the 4×
  KIT.spareTrackLinks strips read as ribbed link runs half-sunk on the
  aft fenders at top 2×/3× — first library fittings on the build
  (census mg0+4d). Deck window NO WORSE: med 54.9 = baseline, sub45
  **1431** < 1465 ✓. If anything the strips read slightly prouder than
  the ref's subtle chain speckle — acceptable within §B3 decoration law.
- **2c p75 HOLD — MISSED BY 0.8, banked honest (adjudicated
  non-blocking)**: hero-rr under-bustle p75 **68.2** vs ≥69 (ref 71.4),
  med 56.5 vs 60.5, sub45 554 (ref 363), crown p95 **100.0** (r6
  108.7, ref 89.3 — the 6 lit crowns toned, order 1a below finishes).

## Visibility adjudication of the two banked windows (game scale, 1×/2×)

- **gear sub45 2358 (gate ≤1500)**: the residual population is the
  deep-shade band on chain/tire/pad surfaces below the skirt lip (rows
  y 0.10..0.24, medL ~45). At 1× it reads as under-skirt shadow; at 2×
  as plausible shade — the DEFECT the window was written against (pale
  rim sparkle) is verifiably gone (hue 59.3, corner ladders ≤4.0). The
  albedo-keyed floor law (r8 law 5) explains why grime terms cannot
  move it and why the corner-ladder pairing caps the chain hex.
  **Does not block.** The ≤1500 number is retired as a gate and
  re-banked as a documented floor residual.
- **2c p75 68.2 (gate ≥69)**: the boundary population is scheme-camo
  surfaces at quarter lighting (mean rgb ~(66,68,53)) — the same
  per-tank-untunable class the r6 verdict banked for 4a/4c. On the
  render the under-bustle reads correctly: dark pockets under the
  rack, canvas plateau lifted, crowns toned. **Does not block.**

## Standing checks (§B + §H.4)

- **§B4 TRACK CONTAINMENT: PASS** — `--exact` 0/0 re-run by me; no
  tooth-over-plate at 4× anywhere; comb exposure below flap bottoms is
  legal §B4 two-layer geometry.
- **§B2 CONTIGUITY / NO EMPTY AREAS: PASS** — machine contig 0; my
  blue-signature enclosed-air census: zero in-body air on close-front/
  top/toptilt/rear; close-roof pockets = thin-rod class, fewer than the
  ref's own (549 vs 958 px). The evaluator's hero-rr 1.116 m² + toptilt
  6.323 m² voids re-verified as projection air — my 80px-cell air
  census of the toptilt pair matches ref cell-for-cell (proc y320:
  43/1/0/1/69 vs ref 43/0/0/2/69; merkava tilt-projection class).
- **§B1 FRONT SLOPES: PASS** — front 26 matched, worst Δ-5.7° (r5
  skirt-top family, gate-priced); glacis rake follows the ref; wedge
  crest Δ+12.5/−13.8, rack-line Δ+10.6/+12.2, hero flags Δ+14.9/−13.9/
  +13.9 = the certified cite-only carrier family, unchanged values.
- **§B5 TURRET PARENTING: PASS** — audit 0/0/0 (stranded/abutting/
  dangling); floaters 100 ×2 in-gate.
- **§B6 TRACK RUN: PASS** — side views show the \\________/ trapezoid:
  both end wheels raised, approach/departure ramps read (rear ramp
  rises to the covered sprocket disc, front to the raised idler).
- **§B3 DECORATION/MG: PASS (visual)** — two MG3s (loader pintle +
  stowed diagonal with receiver), launchers, cables, jerry-block
  dressing, KIT link strips; census carry documented in the packet.
- **ROUNDNESS (§D)**: hatch rings round + concentric at 4× (plan and
  silhouette), PERI cap two-tone concentric, guard rings ribbed-round,
  fan wells true recessed arcs; no polygonal reads (evaluator: no
  facet flags; proc arc census close-front 1 = fan-well curb, benign).
- **§H.4 VARIANT DISTINCTIVENESS: PASS vs all three, fresh strips**
  (crops-r8critic/h4-*): vs **a6 80b76338** — overhang ~1.3 m shorter,
  no L/55 step, a5 louvre+rings+boxes+disc stern vs a6 clean stern,
  a5 covered gear vs a6 exposed spoked wheels; vs **kf51 77020c58** —
  kf51 mast + triple whips + rounded high turret + different gear; vs
  **revolution c5d9e131** — full-height slab bays, black track band,
  modular sensor-tower turret. No re-badge read anywhere.
- FILL/CIRC (owner top-down law): FILL PASS, CIRC PASS.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier")

- **front 8.8** (8.6): covered flaps (vgrad 2.05), glacis in-gate with
  matching hue family, launcher rows + brush guards + round mantlet +
  tube camo. Held by: glacis grain busier than print (rowmean 7.73 vs
  1.53), tier edges at frame top, comb lip.
- **frontleft 8.7** (8.5): launcher ends/rings now read (marginal at
  2×), panel-tinted cheeks, comb olive. Held by: cheek tier seam +
  lit edges, launcher sub-ref bristle, coarse camo grain.
- **left 8.8** (8.6): disc dead-flat olive ✓, strip law byte-stable
  (med 63.4, ratio 1.048, hue 74.8), turret p95 in-gate. Held by: the
  pale roofline bar (tier crown), wheel faces flatter than ref's
  ribbed rims, deep-shade band (banked).
- **rearleft 8.7** (8.5): louvre facade + ring + frame relief (sd
  14.01, p95 106.9) + covered corner + dark disc. Held by: rack
  ribbing regularity, roof tiers, corner +6.6 warm at 3×.
- **rear 8.8** (8.6): band med 82.5 in-gate with 4 camo patches, boxes
  4-tone, X sweep to the rings, corners at the ladder gate, MG
  rod-with-mass. Held by: slat CAD-evenness + capsule patches at 3×,
  taillight p95 96 (cable crossing).
- **rearright 8.7** (8.5): mirror of rearleft; rack-line carrier.
- **right 8.8** (8.6): as left, mirrored.
- **frontright 8.7** (8.5): as frontleft; launcher reads block at 2×
  (weakest quarter for 3b).
- **top 8.7** (8.6): fan wells spoked, link strips read, MG diagonal
  carries the receiver lump, fill clean. Held by: ruled-line deck
  grammar vs organic print, deck med −5.0 (banked camo-bound).
- **hero-frontleft 8.7** (8.6): identity strong; launcher cluster
  visible; straps read. Held by: tier-stack lit edges, deck lines.
- **hero-rearright 8.7** (8.4 — was floor): the r6 kill-list is dead
  (pale boxes → 4-tone canvas, disc crescent gone, comb olive, crowns
  100.0). Held by: the bustle-roof tier bar with pale edges — now THE
  dominant delta at this angle — plus rack ribbing; banked p75/sub45
  adjudicated non-blocking.
- **hero-toptilt 8.7** (8.6): fans shaded, speckle strips, MG diagonal,
  zero in-body air. Held by: ruled deck lines, tier edges at the
  turret, plate-edge highlights.
- **close-front 8.7** (8.4 — was floor): slit CLOSED (census 0
  in-body), glacis calmed + hue family fixed, flap ladder down to
  5.75/5.79 with the banked pad-shadow floor, mantlet round-over-round
  + tube camo. Held at max zoom by: the stepped tier mass with lit
  rims + grey shroud faces (busier than the print's clean wedge +
  EMES), glacis grain overshoot, comb teeth at the flap line.
- **close-roof 8.8** (8.7): PERI cap, concentric hatch rings, launcher
  caps/rings/collars, panel-tinted roof plates, radiator covers, link
  strips at frame edge. Held by: shroud/backdrop faces reading flat
  grey at 4×, loader-MG subtle at 3×, tier steps.

## ORDERS for r9 (round 4 of the projected 3-4 — tone-side only, no
geometry re-authoring; every item re-runs gate ×2 + containment --exact;
graduates frozen; banked classes NOT re-litigated)

**GROUP 1 — TIER-STACK QUIET (the floor driver; kills the last
1×-visible class at hero-rr, close-front, left/right rooflines):**
- 1a. TIER-EDGE RIM QUIET: non-casting dark edge-band overlays (r8 law
  3 class) along the plateau/bustle-roof/wedge tier rims + assembly
  albedo of the plateau roof plates toward the wall tone (law-4: L≤56
  family keeps sunlit faces off the pale-bar read). Done-gates:
  hero-rr crown p95 100.0 → **≤92** (ref 89.3) with 2c p75 ≥68 HELD
  and rear med 82..88 HELD; view-left/right: no continuous pale
  roofline run ≥40px at 1× (the "bar" read dies); close-front 2×: no
  >2px-wide lit rim line along a tier edge; enclosed-air stays 0
  in-body.
- 1b. SHROUD-FACE TINT: the grey shroud/backdrop faces (EMES cluster,
  launcher backdrops, dip-zone fill) take the same-material panel-tint
  overlay (law 1) so they stop reading flat-grey at 4×. Done-gate:
  close-roof/close-front crops show no untextured grey plate run
  ≥20px; roof window numbers no worse.

**GROUP 2 — print-grain tail (2×-scale, second priority):**
- 2a. GLACIS GRAIN PULLBACK: rowmean-sd 7.73 → ≤6.0 by SOFTENING
  anti-slip field contrast toward the hull tone (feather field edges);
  med 65.8 ≤66 and hue 67.8 family MUST hold (overshoot law — no
  darkening). The gun-chin residual certifies at ~5.5-6.0 with the
  split documented.
- 2b. SLAT + PATCH DE-CAD SOFTEN: per-slat ±2 luma jitter on the
  louvre band (panel-tint law at slat scale) + irregularize the box/
  band camo capsule edges (1-2 notches, fixed-tone clones, mip-safe
  per a6 r4 #2). Done-gates: rear med 82..88 held, rowmean-sd ≥4.5
  held, ≥4 patches still cross at 2×, boxes keep ≥3 tones.
- 2c. WHEEL-FACE RINGS: tire/rim two-tone annulus on the road-wheel
  faces behind the comb (albedo-side, L≤56 family; solve WITH the
  corner-ladder/hue system per law 5 — paired knobs). Done-gates:
  view-left 2× wheels read ringed; gear hue ≥50 HELD, corner ladders
  ≤4.0 HELD, sub45 no worse than 2358.
- 2d. LAUNCHER BRISTLE HARDEN: finish 3b — tube-end silhouette from
  BOTH quarters at 2× (push caps toward the 1.41 column limit (~0.02 m
  certified headroom), strengthen end-ring pale, optional 1px top-lit
  tube crowns per §C pale-refund). Done-gate: frontleft AND frontright
  2× crops read tube rows; no new gate columns; dims 100 held.

**GROUP 3 — carry-only (verified this round, no orders)**: gear sub45
2358 (albedo-floor law), 2c p75 68.2 (camo boundary), pad-shadow floor
5.75/5.79, corner +6.6 warm (ladder price), deck med/ruled residual
(camo-bound; 2b may shave the line grammar), 4c/4d classes, taillight
p95 cable crossing, disc-face uniformity, 2.695 crown pair, jerry-can
bottom, wedge-crest/rack-line/hero Δ carrier family, top Δbot 1.66
cliff, projection-air voids (1.116/6.323 m² — air census re-matched).

## Verdict

FAIL — floor 8.7 (frontleft, rearleft, rearright, frontright, top,
hero-fl, hero-rr, toptilt, close-front), ceiling 8.8, mean ≈8.75. NO
machine-gate order: gate 90.8 PASS ×2 bit-identical, hash 50c34724
stable through the campaign, containment 0/0, §B5 0/0/0, §B2 zero
in-body air, rig parity OK, graduates frozen (verified twice), §H.4
distinct vs all three comparators on fresh strips. Every r6 order
delivered or honestly banked with reproducible mechanisms — this was
the strong round the r6 verdict projected, and it landed: both r6
floors +0.3. NOT YET GRADUATION: the tier-stack lit-edge grammar is
still 1×-visible on five views and no view reaches 9.0. It is ONE
tone-side driver plus a short 2× tail; with GROUP 1 landed the floor
views read clean at 1× and the 8.8 views have no 1× holds left —
floor ≥9.0 is reachable in r9. Round 3 of the projected 3-4 — on
schedule, one round out.
