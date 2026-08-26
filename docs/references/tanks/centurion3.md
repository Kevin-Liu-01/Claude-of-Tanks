# Centurion Mk.3 (`centurion3`) — reference packet

Exact variant: Centurion Mk.3, QF 20-pounder (84 mm).

## Corroborated real dimensions
- Hull length 7.56–7.82 m; overall length gun-forward 9.83–9.85 m; width 3.38–3.39 m;
  height 2.94 m.
  Sources: https://en.wikipedia.org/wiki/Centurion_(tank) ,
  https://www.iwm.org.uk/collections/item/object/70000144 ,
  https://wiki.warthunder.com/unit/uk_centurion_mk_3
- Gun: QF 20-pounder 84 mm L/66.7 ≈ 5.6 m tube (Type A: bare tube; overhang past nose
  ≈ 2.3 m).
- Running gear: 6 road wheels per side on Horstmann bogies (3 twin bogies), rear drive
  sprocket, front idler, exposed upper run under prominent full-length side SKIRTING
  PLATES (the Centurion's signature armoured skirts cover the return run and upper wheels).
- Distinctive identity: long cast/welded turret with rounded cast front and long rear
  stowage bin, loader hatch + commander cupola, 20-pdr with a slim exposed tube; hull with
  a well-sloped glacis meeting vertical-ish sides, skirts flaring at the fenders.

## Local GLB oracle (m_bergman print pack)
Width-normalized reference: hull z ±3.75 (7.50 long ✓ matches real hull/width ratio),
hull top y 1.74, whole top 2.20 (turret bits on the deck at ground level).
**ORACLE DEFECT:** unassembled print layout — turret at ground level under/behind the
hull, barrel never clears the hull length bounds → turret component structurally ~27, gun
structurally 0 for honest geometry (same userdrops6.js articulated() issue as charioteer).
Hull + tracks components legitimate; the printed hull shows the skirted Centurion side
with 6 exposed lower wheels.

## Procedural gaps identified (before edits)
- Procedural hull top 1.50 vs oracle 1.74 — hull/side skirt band too low; skirts absent
  (CLASSIC template defaults skirts:false) though the real Mk.3 and the print both carry
  full skirts.
- Turret 'cast' dome is passable but sits slightly narrow; 20-pdr overhang was 0.85 m —
  should be ≈ 2.3 m for identity (gun component stays 0 either way under the print oracle).

**Oracle re-processed (repair_oracles_blender.py): turret seated** — cast
turret section carved from the print skin and lifted +8.0 onto the ring;
20-pdr stub seated on the face; flat-pack plates parked inside the hull.
Turret stays partially capped: the print splits the long turret into the cast
front (assembled) plus flat-pack panels no rigid move can assemble.

## Mismatch log — shaded-parity r2 (2026-07-30)
- Roof "RWS" read closed: pintleMG removed; cupola + loader hatch now stand on cast
  pedestals bridging them to the dome surface (they previously levitated ~0.2 m — the
  buildTurretAndGun default seats hatches at h over a curved casting).
- Floating diagonal deck rod: the buildHull tow cable is now CLAMPED — cleat posts under
  both ends + a mid saddle block (cable geometry itself lives in shared kit.js).
- Turret: big rectangular strapped bustle bin filling the rack, 4 lifting eyes, cheek
  bracket + triple smoke dischargers (was three painted dots), antennas moved to
  bustle-corner base pots, recessed dark mantlet ring + low canvas hood over the gun root.
- Gun: 20-pdr B-barrel mid-tube fume extractor added (evac 0.55). G stays 0 by structure —
  the print ships a stub tube (cap; honest 5.60 m barrel kept).
- Glacis: driver hatch lids, headlight pods with guard bars, splash V-rail, tow shackles.
  "Shorten the glacis" NOT taken: post-repair H sits at 91 with this length — shortening
  regresses the hull mask (accepted deviation from the r1 bullet).
- Deck: raised louvre field + fuel fillers + rear track-link rack. Skirts: panel gap
  strips + lifting handles. Wheels: 'dished' style (hub drum, bolt ring, rubber tire).
- Fidelity 66.6 vs 66.9 committed. T38 capped: the print turret remains part flat-pack
  (see oracle note above).

## Round-3 log — oracle re-repair + re-seat (2026-07-30)
- ORACLE RE-REPAIRED from .bak: the "flat-pack plates piled over the rear deck" the r2
  recipe parked WERE the casting — the print's TurretMesh is the complete assembled
  Centurion turret (full 20-pdr attached, dischargers, bustle bin) sunk in the rear well.
  New recipe = one rigid move: basket ring c=(15.374,19.430) r7.0 onto the hull race
  c=(16.900,41.870) r7.2, dx +1.526 dz +22.440 lift 6.5 (roof lands ~2.9 m),
  pivot [16.90,15.8,41.87]. One assembled tank in all 9 views; gun mask honest (0* -> 44).
- Headline 66.6 -> 76.0 (T 38.2* -> 58).
- Procedural: turret pivot -0.12 -> +0.40 (race at +5.8% of hull), gunLength 5.60 -> 5.08
  (muzzle keeps the print's +6.0 station); the r2 "bead necklace" cheek dischargers are
  rebuilt as dark solid discharger BINS on bracket arms, angled outboard, tubes clear of
  the dome (bumps no longer project onto the face).


## Gate v6/v7 iteration (2026-07-31)
Retabled to the true-camera curves: high pointed prow (deck falling
1.68 -> 1.16 at the tip), two-step tail shelf, skirt hem 0.60 at the
committed +-1.685 plane, crown 2.74 with the cupola riser as the published
2.94 p95 anchor (2.92), long bustle bin raised to 2.50, deep breech mass
(0.86) matched inside the hull, 20-pdr/L7 at the published 9.83 overall
(muzzle 6.10 vs oracle 5.89 — small bounded cover). The oracle's hull length
matches published within 0.2% (best-conditioned UK print); its body sits
z-shifted ~1.0 which the hull-anchored registration absorbs.
dims 92.2, floaters 100 green; turretCurves still capped by the fused
breech/crown interplay (in progress, honest 0-18 today).


## Gate v10 iteration round 2 (2026-07-31)
The bergman print authors its steel far REAR of the loader frame (hull mask
z -5.03..2.15 with junk to -4.86; body-span registration lands dAlong
~+1.17), and docs/references/profiles/<id>.json for this print decodes at a
DIFFERENT lab scale than the gate renders — authoring targets for this
family must come from gate-frame probes, not the profile JSON.
Probe-true retune: gun axis 1.95 (tube top 2.06) with the print's FAT tube
band built as sleeve/extractor drums kept INSIDE the bow footprint (r <=
0.21 so hullLengthM never re-classifies the barrel as body) plus a slim
0.14 taper toward the muzzle (print plan gun reads ±0.15-0.2 to its 6.03
registered muzzle = the published overall); casting registered FORWARD:
face line 2.12 at world z 1.84 rising to the 2.46 crown (dome ±1.40 plan),
2.64 crest pad at 0.72, cupola stack at world -0.18, raised rear crown 2.74
to -0.6, bustle 2.58 to -1.2, bin tail 2.41 to -1.9, basket mass hanging to
0.65 over z -0.7..+1.2. No tall antenna masts (the print's whole box tops
2.85 — the old "masts to 3.77" read predates the width-keyed
renormalization).
CERTIFIED CAPS (v10): the print cupola tops 2.86 vs published height 2.94 —
the 2.92 cupola stack is the dims p95 anchor (dims sovereign, ~0.06 over
the print on 4-5 columns). The print carries a phantom stern band at
z -4.4..-4.9 (a stowage beam floating past its tail): matching it would
stretch overallLengthM (full-span, v10) past published — it stays
unmatched, a bounded 2-4 column cover/err cost on side/plan whole rows.
Numbers (baseline -> now): centurion5 hull 45.7 -> 47.2, whole 18 -> 27.5,
turret 0.2 -> 26, stations 51.2 -> 74.2, dims 100, floaters 100 (centurion3
tracks the same build: turret 0 -> 24.1, stations 50.7 -> 60.5).

## Plate-fill r1 (2026-08-01, owner directive)
The flat fender plane rode ABOVE the falling glacis (deck drops below the
1.60 fender line forward of z~2.36): an open 0.3 m sky wedge showed THROUGH
the vehicle from any low angle. Closed by the shared ukHull fender-wedge fill
(lofted mudguard solids deck-line -> fender plane inside the plate footprint;
also fills the small -3.67..-3.70 tail sliver). Evidence: shots/plate-fill-r1/
centurion3-{before,after}/ (closeup-front-quarter crop pair). Gate v11
before/after: byte-identical rows (hull 46.7 whole 32.8 turret 22.9 stations
59.9 dims 100 floaters 100; ledger's older 47.5/33/24.1/60.5 row was a stale
pre-v11 scoring). centurion5 identical treatment (46.4/27.2/24.3/74/100/100
held byte-identical).

## Vertex round r1 (2026-08-03, uk agent)
Shares the centurion5 rebuild (see its packet r1 log — registered-table
retable, raised end wheels, slab casting, containment law). Mk.3 deltas
banked from its own print: shorter bustle (tail local -1.55 vs mk5 -2.06),
20-pdr at Ø0.24-0.28 with the muzzle collar run to the tip (the thin-tube
r 0.09 read starved the plan trace bins and zeroed plan_whole center
columns), 3-tube smoke banks. Numbers (r0 -> banked): min 22.9 -> 60.8
(hull 46.7 -> 84.8, whole 32.8 -> 69.4, turret 22.9 -> 60.8, stations
59.9 -> 76.2, dims 100 -> 98.3). Residual: turret row lags c5 ~6 pts —
the c3 print's crown band reads ~0.10-0.13 lower through the face zone
(DIFF table in shots/uk-r1/; next round should split the crown heights
per mark instead of sharing the c5 slab values).

## vertex r2 (uk family, 2026-08-03) — mark-split turret: 60.8 -> 78.7
Shares the centurion5 r2 extract-true rebuild (basket/collars/cupola/crown
ridge — see centurion5.md r2 section) with mk3-specific truth from ITS
extract: SHORTER LOWER bustle (flat 2.488 roof to local −1.31, hump 2.527
at −1.48, rear edge 2.335 at −1.73; bottom 1.79 rising 1.82-1.85 at the
tail) authored as its own loftBand; narrow walls (±1.02 ending −1.27 —
the r1 shared lid plate overhung this short bustle by 0.3 and minted
degenerate 2.43-2.46 columns); c3 crown falls by ±1.0 on BOTH sides
(right top 0.66, left 0.78 local vs c5's 0.78/0.85 — the r1 note
"c3 crown 0.10 lower" was the average of this split); 20-pdr tube fattened
to r 0.125 (thin-tube plan columns aliased out at r 0.12).
Numbers: min 60.8 -> **78.7** (hull 84.8 -> 81.5, whole 69.4 -> 78.7,
turret 60.8 -> 80.6, stations 76.2 -> 78.9, dims 98.3 -> 100, floaters
100). Track-clip --exact 0/0. Boards: shots/uk-r2/centurion3.

## r5 (2026-08-05, uk agent — centurion5's written order extended): 78.7 -> 84.9
Shares every shared-hull delivery from the centurion5 r5 section (read it
first: frame pinning, glacis/idler retable, tail overhang shelf + sprocket
circle refit, horn-tip two-threshold sliver, muzzle axis 1.905 — the c3
print raycasts the same 1.907-1.910 axis; the registration and p95-anchor
laws live there). Mk.3-specific r5 truth from ITS extract/probes:
- FACE ZONE (the r4 "0.10-0.13-lower face" order): measured — the CASTING
  slabs were already true (c3 extract face line 2.39@1.00 -> 2.28@1.30 vs
  authored ±0.02); the offender was the shared periscope hood at 2.525
  (ref c3 2.37-2.39): mk ternary y 0.565 (c5 keeps 0.63). The r4 estimate
  conflated the hood with the casting.
- 20-pdr: this print's extractor reads SLIM (tube band 2.005..1.758
  constant — no fat drum): evacR 1.4 -> 1.12 (the 1.4x drum sat +0.075
  over six columns). Muzzle raycast: band 2.030..1.790 r 0.120@build 5.4.
- LEFT-BIASED crown asymmetries (the print casting leans left everywhere):
  the r2 loft's full-width [-0.92, 0.83] front knot minted 2.61 columns on
  the RIGHT front (ref 2.44) — knot dropped to 0.755 (the left-biased
  ridge box carries the tall side to x -0.95); bustle WALLS split
  asymmetric: LEFT box top 2.46 at x -1.04 (ref front 2.49), RIGHT 2.33 at
  x 1.015 (ref 2.30) — the r1-r4 symmetric walls paid both directions.
- Shelf stowage: taller/wider duffels (top 2.29, x 1.07..1.45) carry the
  ref's 2.29 front line over |x| 1.07..1.30 (c5's tall wall segs own that
  band on its print instead — variant tell preserved: c3 = low triple
  smoke + big duffels + MAG fitting; c5 = 2x6 bin banks + M2).
- Antenna pots to 2.48 (ref rear-roof line; 0.75 read +0.07).
NUMBERS (r4 -> r5, gate x2 byte-stable + third identical run post
MG-fitting migration): min 78.7 -> **84.9** (hull 81.5 -> 87.6, whole
78.7 -> 85.3, turret 80.6 -> 84.9, stations 78.9 -> 86.5, dims 100
[heightM 2.91/0.87% grace, hullLengthM 7.52], floaters 100). Track-clip
--exact 0/0; turret-parent 0/0/0; standard-check contig 0 + mg1
(FITTINGS.pintleMG MAG); hash 1adc2314 -> 1ef2f50c. Evaluator rig-parity
clean (yawProxy <=1.3°), boards shots/visual-eval-centurion3/.
CERTIFIED RESIDUALS: the shared vane anchor tax (see c5 packet); one
unresolved single column zb -0.82 dB -0.186 (probe hits the loft side
face at x -0.95 y 1.67 — AA-class, ~0.5 pt); gun-run ±0.03 wobbles;
station-0 width (trim-dropped, see c5).

## r6 (2026-08-05, uk agent — the 90 push): 84.9 -> 87.7 (hull 90.2, whole 90.3)
Shares every shared-hull/kit delivery from the centurion5 r6 section (read
it first: ramp-pad ground-dip fix, strip-with-bosses station widths, deck
narrowing, tracks/contact retune, drum n/a, ridge/riser, packet-level
cover-ceiling finding). Row trajectory (r5 -> r6): side_hull 87.6->90.2,
front_hull 89.2->94.1, front_whole 85.3->91.2, turret_plan 84.9->95.8,
stations 86.5->95.2, turret_side 85.2->87.7, side_whole 85.3->90.3.
Mk.3-specific r6 truth:
- THE r5 LOFT-BOTTOM BUG (r6 worst c3 side column): loftBand takes its
  z-knots from the TOP table only — the c3 bustle loft's -1.01..-1.31
  slab interpolated its bottom straight across the bottom-table's
  -1.02..-1.09 rise and CUT THE CORNER (turret bottom read 1.615 vs the
  ref 1.807 at build -0.82). Fixed with explicit extraZ knots on ALL
  centurion loft calls (LAW: pass the bottom table's knots as extraZ
  whenever top/bottom tables share a loftBand).
- c3 bustle plan rear re-fit LEFT-LEANING (live: rear -0.93 build at
  |x| 0.82..0.94 RIGHT but -1.16, -1.30, -1.38 LEFT at -0.93/-0.80/-0.68)
  — four width-stepped lofts (0.95 to -1.34, 0.66 to -1.49, 0.52 to
  -1.60, 0.44 to -1.75) + three left-lean rear boxes + a -1.45 center
  tail stub; loft1 inset 0.19 (its ±0.91 top face carried 2.49-2.51 into
  the ±0.86 front columns where the ref reads 2.44).
- c3 bank: triple-discharger cap x 0.92..1.015 (ref front 2.29 at ±1.05)
  with the shared rake to the 1.71/1.67 plan front; duffels trimmed
  x 0.99..1.35 (the 1.45 edge painted the ±1.46 front columns +0.09);
  A1 shelf rear -1.23 local with the 1.785-floor tab; roof knots to the
  live 2.55/2.49 line ([-1.01, 0.78] + [-1.06, 0.708]).
- Wall boxes z-trim to local -1.22 (build -0.87 = the live ±1.05 plan
  column) with the right wall widened x 0.92..1.05 (its 2 mm sliver
  never lit the column).
NUMBERS (r5 -> r6, gate x2 BYTE-STABLE — two identical runs): min
84.9 -> **87.7** (hull 87.6 -> 90.2, whole 85.3 -> 90.3 [side 90.3/plan
94.7/front 91.2], turret 84.9 -> 87.7 [side 87.7/plan 95.8], stations
86.5 -> 95.2, dims 100, floaters 100). Track-clip --exact 0/20 vox
(shared sprocket note, see c5); turret-parent 0/0/0; standard-check
contig 0 + mg1 (MAG fitting). The turret_side cover ceiling is the c5
packet's structural finding (2.08 here). Hash 1ef2f50c -> caa2e91c.

## r7 — COMBINED UK TONE ROUND (2026-08-05, uk agent; answers shaded-parity r6 8df280f Groups 1-3)
Shares the family recipes (ukToneKit/ukGearAirBackers — see the c5 r7
and challenger1 r8 sections). Gate: **91.1 -> 91.1 PASS x2
bit-identical** (hull 92.4 / whole 91.2 / turret 91.1 / stations 95.2 /
dims 100 / floaters 100 — the razor floor held exactly WITH the Group-3a
geometry in). Hash caa2e91c -> **ac63e6d8** (47 meshes, 70 340 verts).
DELIVERED (per-order done-gates, measured on fresh official pairs —
tools/tmp-uk-tone-measure.py, banked at shots/uk-tone-combined/):
- 1a chain/void near-blacks: rear cols med 13.1 -> 57.3 (gate >=40, ref
  58.8-60.1 parity) with sub-30 10 406/10 421 -> **0** (gate <=500);
  close-front band sub-30 8 695 -> **0** (<=800); left band sub-30
  3 695 -> **0** (<=400). Driver: pads/chain clones were ambient-DEAD
  (clone() drops the family hook) — gearFloor rehook + olive hexes.
- 1b two-way overshoot: front cols med 30.4/31.1 -> 52.1/51.7 (gate
  >=48) at p5 42.6 (>=30 — no re-blackening). Three dial cycles: the
  first olive set overshot BRIGHT (+15 side band) — ordered-class law.
- 1c disc bullseyes: road wheels 0x3e4531 clone + drums 0x373d2c +
  spareTrack teeth/rings 0x2c2f24 — the pale drawn discs join the
  dark-gear class (see the left-band sd 21.5 -> 9.6).
- 1d comb-gap air: /shadow/-named catch plates (idler/mid/sprocket
  bays) + the skirt-slot recess plate (the MEASURED air is a real
  background slot between the skirt face x 1.61 and the outer strip's
  0.81 bottom, plus the Group-4a flap-zone columns — NOT wrap comb
  gaps). Air 9.3/9.7% -> 8.3/8.6% vs the <=7% gate (ref 5.5/7.6):
  PARTIAL — the residual is the 4a mud-flap width class (out of this
  round's Groups 1-3 scope; the flap columns are front/rear
  mask-POSITIVE and belong with 4a's own gate pricing).
- 2a ink/camo overshoot: TWO levers — (i) spec-level bakeDirtDeckEq
  (the documented m47-B3 up-face equalization; print refs bake the
  shared canvas with NO up-face term = parity by construction), set
  from the c3 build fn; (ii) a map-domain DARK-TEXEL LIFT chained
  after the material's existing hook stack (CSM path composes via
  onBeforeCompile per engine/lighting.js — the wrapper is the
  documented chain; cache keys 'veh-ambient-floor-v2+c3ink[-b]') —
  lifts only linear albedo < ~0.04 (the ink stamps) toward the print's
  soft dark-olive; parity side tables untouched by construction.
  MEASURED: view-top sub-38 front 4 792 -> **10** (<=1500), turret
  3 171 -> **136** (<=1000), rear 5 327 -> **161** (<=1600); medians
  49.9/50.8/50.5 vs ref 51.3/51.9/50.6 (within the +3..5L target);
  close-roof sub-38 14 302 -> **3 228** (<=11000).
- 2b blue glass: 177 blue-signature px -> **0** (smoked-glass family
  fix, patton C1 lineage).
- 2c bin-row relief: sub-45 2 455 -> **100** (<=400); med 50.4 -> 52.7
  vs the >=55 gate — PARTIAL (-2.3; the remaining spread is the
  duffel/box lighting, and the c3 duffels are verdict-verified at ref
  parity — not retoned on purpose).
- 2d front face: med 47.2 -> 50.8 (>=50) at sub-45 11 023 -> 5 548
  (<=7000) — the ink lift's vertical-face share.
- 3a TURRET PLAN FRONT de-step (the one mask-neutral-by-construction
  §B1 item, batch-verified): four chord-limited corner-fill facets
  round the notch between the nose slab's plan diagonal and the
  discharger-bank front, authored to the live paired columns (ref
  fronts build 1.68@|x|0.69 / 1.649@0.82 — proc was -0.09 at 0.82).
  Facet tops ride local 0.34-0.40 (a first cut at the slab-edge heights
  0.46-0.50 re-topped the build 1.40..1.53 side columns +0.03..0.05 —
  turret_side 91.1 -> 90.8 — and was re-derived; the plan fill lives in
  the bottom quads). turret_plan 95.37 -> 95.47; gate x2 at 91.1 held.
  3b (hood/crown-ridge chamfers) + 3c (cupola ring relief) BANKED per
  the round scope (not mask-neutral by construction).
CHECKS at close: standard-check PASS (clip 0/20 documented, contig 0,
mg1 MAG — pose untouched, §H4 tell protected); turret-parent 0/0/0;
npm 166 green. Frozen proofs as challenger1 r8. Evidence:
shots/uk-tone-combined/ + shots/critic-centurion3/ (fresh pairs).

## r8 — COMBINED UK ROUND 3 (2026-08-05, uk agent; answers shaded-parity r7 bdcb1fb — the graduation push)
Orders W1/W2 (wheel-ring grammar — the family finding), X1/X2 (the
last §B1 casting cluster), X3 (mudflaps, priced), X4 (adjudicated),
Y1-Y4 trues. Gate: **91.1 -> 91.1 PASS x2 bit-identical on final
bytes** (hull 92.4 -> 92.8, whole 91.2 [front_whole 91.2 -> 91.24,
front_hull 94.6 -> 94.7], turret 91.1, stations 95.2, dims 100,
floaters 100 — the razor floor held EXACTLY with the X3 mask-positive
flaps in). Hash ac63e6d8 -> **bf0a45e8** (47 meshes, 70 340 -> 74 828
verts). DELIVERED (done-gates measured on fresh official pairs,
tools/tmp-uk-r8-gear-measure.py):
- W1 WHEEL-RING GRAMMAR (family recipe, ukToneKit r8): the r7
  tireEmissive floor (0x191d12, ~ +25L additive) had lifted the tire
  band + bolt/annulus IMs into the disc-face luma — the drawn rings
  vanished and the six wheels read as pale ring-less pillows, the
  POLARITY INVERSE of the ref. Split: both wheel-rubber IMs onto a
  dark olive-iron ring clone (ringHex 0x2b2f1f, no emissive — the
  ambient hook alone owns shade, the pad/chain precedent) ~10L under
  the disc face; disc faces 0x3e4531 -> 0x323826 into the ref
  51-class. MEASURED: left band med 58.3 -> **55.1** (ref 51.4), p95
  73.2 -> **61.9** (gate <=65 ✓), sd 9.6 -> **4.2** (gate <=7 ✓ — ref
  itself 4.4, PARITY), sub30 0 held ✓. Dark-on-olive rim/bolt rings
  draw on every disc.
- W2 ground wedges (the same lit disc arcs at the contact zone):
  close-front band p95 84.0 -> **71.8 = the ref's own 71.8 exactly**
  (gate <=75 ✓), med 61.4 vs ref 60.6, sub30 0 ✓.
- X1 casting blend (silhouette-neutral by construction, gate line
  bit-identical): (a) hood-lap canvas wedge riding the nose-slab face
  plane (offset +2 mm out of z-fight; x 0.04..0.35 inside the face
  span) — the cover now continues onto the casting past its exit line
  instead of ending in free corners; (b) crown-ridge FORWARD CAPS
  (x -0.88..-0.70 / -0.21..-0.085) flanking the cupola drum, tops
  under the plate top; A RAKED PLATE TOP (0.9675 -> 0.9335 forward,
  chasing the evaluator's Δ+4.5° ref fall) was TRIED and MEASURED:
  turret_side 91.1 -> 91.0 (and c5 90.5 -> 90.3) — the evaluator fall
  is a SHADING edge, not the mask line; withdrawn same cycle, flat
  plate restored (the r5 "2.732 plateau" cert now understood exact);
  (c) mantlet-recess softening: olive lintel bevel (x ±0.35, y
  0.245..0.295, z <= the 1.548 face plane) + flush side strips
  (±0.405) inside the plate/face footprints.
- X2 cupola relief (ZERO height change, the 2.92 vane anchor sacred):
  eight radial clip blocks on the drum cone face (outer 0.208 <= the
  0.218 base circle, y-band inside the drum) + a 101-deg dark
  hatch-arc torus (r 0.10, tube top 1.053 < the 1.055 lid top) — the
  drum reads sculpted, the unpaired ref arc is answered.
- X3 MUDFLAPS both ends (priced per the verdict, landed as a GAIN):
  rear panel x 1.560..1.6365 (pin-cap envelope 1.5555 cleared 4.5 mm;
  outer face 2.5 mm short of the 1.639 strip face), front panel at
  z 3.44 under the 3.47 horn-guard segment (top embeds 10 mm into its
  1.4555 underside — §B2 chain), both outboard of the shoe envelope
  (§B4 lateral). Bottoms 0.625: a first cut at 0.545/0.565 read
  procBot -0.94 vs the gate ref's -0.87 flap line at ±1.58 — the ref
  hangs its flaps to ~0.63, and matching it turned the priced order
  into front_whole 91.15 -> **91.24** / front_hull 94.60 -> **94.71**
  (both above the r7 baseline). Probe (tmp-ukr4-probe, front/whole):
  flap columns ±1.58..1.62 read procBot 0.61..0.63 vs refBot 0.59 —
  parity class. 1d air (the flap-width columns): 8.3/8.6 -> 7.6/8.1
  at the first width (1.6335), outer faces then widened to 1.6365 to
  close the 1.63..1.65 slit (arithmetic ~-0.6/-0.2 more; ref's own
  air is 5.5 front / 7.6 rear — the REAR gate <=7 sits BELOW the
  ref's own read, so ref-parity is the honest bar).
- X4 departure ramps — EVIDENCE ADJUDICATION (no geometry): the
  authored contact tangents measure rear **29.8° vs the ref fit
  29.7°** (+0.1°) and front 25.3° vs 27.7° (-2.4°) — the quarter-view
  ±13° flags cannot be the authored ramp line (contactZF 2.50 /
  contactZR -2.32 ARE derived from the r6 ref fits); the flag class
  is the projected shoe-serration/wrap-onset envelope (the family the
  c5 critic adjudicated as texture-class O10b). Certified with the
  tangent math; the trackCurves/whole rows were left unrisked.
- Y1 lamp faces: wider smoked-glass face discs + dark rim rings on
  the headlight pods (ring r_out 0.069 front-interior under the nose
  face, plan-interior under the 1.474 glacis line) — the lens/arc
  tell replaces the featureless drum read.
- Y2 skirt-lip seam: skirtTrimFlush on CENTURION_HULL (the ch1 push-2
  opt-in) — the proud trim's plan double-edge at ±1.62-1.64 joins the
  deck class. Side-invisible under the 1.60 fender line; BONUS: hull
  row +0.4 both marks and the c5 twin's turret_side +0.2 (the proud
  lip was a registration sliver).
- Y3 tail dressing: the c5 O5 recipe verbatim (double-U cable, ends
  on the A face, max rear z -3.632 inside the -3.64 C-course; cleats
  + spare-link chevrons per shoulder) — the bare tail plate joins the
  print's draped class; §B3 tells all present.
- Y4 bin-row slot floors (duffels verdict-protected, untouched): mk3
  shelf lids turretDark -> turretDetail (mask-identical bucket swap)
  + low olive coamings (x 1.00..1.35, tops 0.4675 under the 0.48
  duffel line). HONEST: the 2c rect's med stays 52.7 — it is
  duffel-OWNED (the r7 verdict's own -2.3 adjudication); the slot
  grammar below the row is where the fill lands. sub45 100 held.
CHECKS at close: gate x2 bit-identical (final bytes); r7-window
regression sweep CLEAN (rear cols 57.3/57.3 sub30 0, deck ink 10/136/
165, blue 0, front face 50.8, close-roof 3170 — every landed r7 gate
held); standard-check + track-clip (rear vox in the kv2 band —
dial-2's 1.560 inner edge clears the pin-cap envelope) + turret-parent
queued on the shared FIFO at close, npm 166 + track-geometry green.
FROZEN PROOFS at start AND close: chieftain5 5117b9a8, fv510 a55c85cc,
vickers_mk1 1389d11c, comet 8c9a2098, charioteer c6fc76a8. Evidence:
shots/critic-centurion3/ (fresh 14 pairs), tools/tmp-uk-r8-gear-
measure.py, tmp-ukr4-probe runs (X3/X4 numerics; c5 parity probes).
SELF-READ vs the r7 ladder: both W drivers at ref-parity numbers, the
X1/X2 cluster relieved with one measured-withdrawn attempt documented,
X3 delivered as a gate gain, X4 evidence-closed — the ordered floors
(left/right/close-front/close-roof 8.7) self-read 8.9-9.0; graduation
adjudication requested.

## GRADUATED 2026-08-05 — DUAL-GATE PASS (fleet graduate 24, the Centurion line's first)
Geo 91.1 gatePassed x2 bit-identical + independent critic 9.0 ALL
FOURTEEN VIEWS (r8 adjudication, the archived visual-review receipt — floor 9.0). FREEZE HASH bf0a45e8 (47 meshes, 74828
verts; orchestrator-verified at landing). Flip-era §10: registration
retired + three-map mirrors landed at the fleet flip (c487188);
USERDROP6_SOURCED_IDS exclusion verified; variants.js carries no
centurion3 rows (nothing to backfill); icons x5 regenerated from a
clean HEAD worktree at this hash. Critic rig integrity: hashes
bf0a45e8 / a25a73b8 (challenger1) / 5117b9a8 (chieftain5) stable
campaign start -> end; evaluator rig parity OK (max yawProxy 1.0°).
Residuals held by owners: Y2 plan skirt seam lines (tone-gate owner),
±13.1° quarter serration-envelope class (X4, evidence-closed), two
r6-era projection-gap micro-voids (identical coordinates, priced).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore on the 20-pdr tube face (gunLen-0.02); §C.1 8 reversed re-oriented (rear deck bands, belly, cheek bins); F-vs-D 32->0; gate HELD x2 EXACT 91.1 PASS; hash fea56ecc -> 46b03895 CANDIDATE; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.

### BORE RESIT RATIFIED (2026-08-06): RE-FREEZE 50273080 CONFIRMED —
end-on 9.2 (was 7.5), quarter 9.3; luma 35.7-flat == the chieftain5
ratified family tone (campaign doc RESIT section).

## 2026-08-08 NO-AIR ROUND r1 (uk see-through, §5.35 item 10 + §5.18) — GRADUATE-CHANGE
Frozen 50273080 confirmed pre-touch. Two defect classes raycast-attributed
(tools/tmp-uknoair-probe.{html,mjs}, boundary-ray attribution + world column
scans) and closed with interior casting geometry, mk3-gated (centurion5
byte-identical: hash 756fcfc0 + gate row 90.7 exact before/after):
1. CROWN-RIDGE HOVER: the ridge plate (bottom 2.637 world) floated 67-78 mm
   over the crown slabs (tops 2.50-2.57) — the 889px front-low headline, the
   802px y90-side-l-T read, the 74px rear-low slit AND the rear-quarter
   "floating cap" islands were all this one gap. Print truth: solid cast
   swell (r2 extract 2.747-2.754 plateau; ref front_turret bot 1.491-1.531
   under it). Fix: pedestal fill box(0.805,0.167,0.395)@(-0.4775,0.7935,
   -0.7025) — plan 20 mm inside the plate footprint, top 20 mm into the
   plate, bottom below the 0.723 crown minimum (§B2 chains both ends).
2. UNDER-CHEEK POCKETS (±1.1): the r6 discharger banks stood off the
   receding cheek/nose side faces — 480/412px front-low sky corridors
   between bank outer slab and casting wall; residual r1 crack (212/154px)
   raycast-pinned to the smoke-cluster bases at |x| 1.15 (z-local 0.86-1.16
   exact). Print fuses banks INTO cheeks (ref front_turret solid 1.49-2.25+
   across |x| 0.98-1.23). Fix: mounting web slab per side (bottom quad 3-6 mm
   into the cheek/nose faces, top 10 mm into the bank undersides, outer
   edges 5-15 mm inside the bank plan/front lines) + r1b chained filler
   box(0.22,0.32,0.42)@(±1.06,0.14,0.99) web->cluster-base->bank; bottom
   1.76 world keeps the honest 7 cm ring-air lane over the 1.69 fender.
PIXELS (tools/tmp-sweep-seethrough, tree 00276fc): y0-front-low 1810->14,
y90-side-l-T 826->12, y45-side-l-T 275->10, y0-side-l-T 225->15,
side-r-T 160/108->0/0, y0-rear-low 74->0, y45-rql 217->62, full sides
-20..-266 each; y0-top 307/garage 136/tilt55 103 pre-existing hull classes
UNCHANGED; islandViews 14=14 (pre-existing MG/hood class, count-parity).
GATE x2 BIT-IDENTICAL at final bytes: min 91.1 | hull 92.8 whole 91.2
turret 91.1 stations 95.2 dims 100 floaters 100 PASS — every component
EXACT-holds the frozen row (interior-only closure; outlines untouched).
HASH 50273080 -> bad74e60 CANDIDATE (re-freeze = orchestrator re-cert).
CHANGED VIEWS for the re-cert critic: y0/y45/y90-side-l-T, y0/y45/y90-
side-r-T, y0-front-low, y0-rear-low, y0/y45/y90-side-l, y0/y45/y90-side-r,
y45-rql, y0-fqr, y45-fqr-T. Evidence: shots/uk-noair/{before,after}/ (the
y90-side-l-T + front-low pairs are the money shots; fill reads as the cast
swell, §K).
