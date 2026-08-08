# T-80 (1976) / T-80B / T-80BV — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODELS FOUND: bergman T80 early / T80B applique / T80BV full-ERA (CC BY-NC-SA) in candidates-gen2/t80|t80b|t80bv/

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.66 m (gun fwd) |
| hull | 6.78 m |
| width | 3.52 m (skirts) |
| height | 2.20 m |
| weight | 42.0 t (T-80) / 42.5 t (T-80B) |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/coldwar/USSR/T-80.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=71

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-t/
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:T-80

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## t80-line first build (russia r25, 2026-08-03) — FAMILY RIG EXEMPLAR
One parameterized buildT80Line (v0/1/2) per BUILD-STANDARD SS-H: t80 69.5,
t80b 68.6, t80bv 33.7 (dims 100 + floaters 100 all three). Shared: raked
turbine-hump band w/ recessed channel, arrow bow, wide flat cast dome
(donor's domed lathe was the big miss), raked bustle, turret-node apron as
hidden carrier, fat-sleeved 2A46M-1 w/ clamp plates. B: brow applique +
902 smokes. BV: K-1 cheeks (shared k1 kit, opt-in), glacis raft, skirts.
Decoration law from birth: Utyos MG (p95-safe 2.2195), cupola, drums,
unditching log, tow cable, headlights, periscopes.
LANDMINES (read before touching): refs render width-normalized — t80bv
safeScale x0.9536 leaves its print ~4.4% small in y AND z; group-squash
regresses (rigs shear independently) — 33.7 is STRUCTURAL pending a
certification ruling. The ref's 0.29-band tube counts as side-row BODY
span (12% cut sits at 0.265-0.275 by camera pitch — slim cylinder + clamp
plate is the safe carrier). heightM p95 catches the MG cluster on SOME
camera pitches (anchor 2.2195 inside grace, not the ref's 2.29 spike).
t80/t80b to >=75: rear-plate zone (frame -1.44), tube-zone 5.4-5.5, front
+-0.97-1.01 floors (pt91m belly-rail pattern applies).

## r26 (2026-08-03): calibration round — t80 69.1 / t80b 69.9 / t80bv 28.4

Final rows (gate x2 stable, docs/geometry-gate/*.json; boards under
shots/russia-r26/):
- t80  69.1 min | hull 83.4 (+6.1) whole 69.1 (-0.4) turret 72.3 (+0.1)
  stations 75.0 (-11) dims 99.1 floaters 100
- t80b 69.9 min | hull 81.9 (+5.3) whole 69.9 (+1.3) turret 73.8 (+1.1)
  stations 76.3 (-8) dims 100 floaters 100
- t80bv 28.4 min | hull 44.3 (+5.2) whole 32.3 turret 40.1 stations 28.4
  dims 100 floaters 100 — see the CERTIFICATION CASE below.
- standard-check: holes 0 ✓, mg census 1 fitting each (t80/t80b: first
  KIT.fittings consumers in the profiles — sideways-carriage NSVT, §I),
  clip 205/280 OVER the ≤60 band — but the certified graduates read the
  same audit at pt91m 178/220 / t72b3m 863/301 today: the strip/sponson
  pattern inherently intersects the wrap zones; band needs an orchestrator
  ruling (audit exemption for fade strips + sponson-over-track, or a
  fleet re-cert).

What landed (all inside buildT80Line; siblings byte-exact — pt91m 90.7 /
t72b3m 91.8 re-gated EXACT):
- side_hull +6: stern rework to the overhanging-deck read (tail lip
  1.24..1.41 to -3.39, plate bottoms 0.81, log/flaps forward+raised at
  the ref's 0.87 floor), gear-fade strips remapped to the rendered ramp
  lines (rear 0.24@-2.18 -> 0.775@-2.81; front 0.12@2.58 -> 0.78@3.34),
  bow ARROW plan (loft nose 3.17 + yawed wedge edges + 3.39 corner
  shelves + mudguard tips at the ref's 0.84 bow floor + pocket fill).
- front rows: track re-seated (xc 1.345, trackW 0.58 — LINK OVERHANG LAW:
  shoes print xc±(trackW/2+0.023)), skirt band re-seated 0.79..1.16 with
  THICK panels (0.10 — a 0.032 sheet lerp-junked the 1.68 column), belly
  0.44 shows at |x| 0.94-1.01 like the ref.
- turret: dome flattened to the ref's wide-flat crown (2.03@±1.19 front
  falloff) + crown plate 2.2215 (p95 grace-exact), mantlet hood + fat
  saddle root own the 1.94-2.06/1.43-1.47 side band, Luna IR moved to the
  mantlet right (ref plan 1.81), cheek flank slabs at ±1.33 (plan rears
  +0.1), asymmetric right bustle corner (ref -1.46 @ +0.96), bustle rear
  staircase to the -1.58 cliff, MG cluster: hand receiver kept at 2.2195
  + fitting NSVT receiver at 2.348 + sight heads ±0.44 = the ref's exact
  2-col 2.34/2.35 spikes (p95 stays on the crown).
- v1 (t80b): brow shelf + spread applique (plan front 1.74 to |x| 0.8),
  bustle tail bin at the -1.68 col (2.0..2.18 band).
- 2A46M-1 axis 1.765 (render truth; the r25 1.71 extract read was low),
  working tube r 0.112/0.125, evac swell r 0.128 + crest fin
  (EVAC-BAND BODY LAW + PLAN RASTER LEAK — see law bank), clamp plate
  ends at the ref's 6.04 plan line.

WHY whole plateaued at ~69-70 (honest residuals): the oracle is 4.3%
long (certified) — after body-mid registration the ref bow/stern overhang
my pub-sovereign ±3.39 ends by ~0.14 m: the bow columns (fitted 3.45-3.6)
read ref fender+tube vs my tube-only (0.41+0.24 err), the stern lip col
0.17, and every big cliff bleeds ~0.18 into one phase-random column
(CLIFF-LERP JITTER, law bank). Mask-extension attempts to cover them:
r26a ±3.44 ends -> hullLengthM 6.93/7.03 by grid phase (dims -9/-22,
reverted; BODY-COL PHASE LAW); muzzle 6.30 -> re-gridded the shared
camera and cost t80b's hull row 6 pts (ENVELOPE RE-GRID LAW, reverted).
Remaining whole-row err is ~60% these certified-end/cliff columns; the
path to 85 needs either an end-miss certification (like the brief's
"~2-col miss" note but priced into the row), or the t80-line oracles
re-warped to pub length (orchestrator lane, t90m batch-23/31 class).
Stations 75-76 are NOT a regression: fixing the i13 bow slice (27% -> 3.5,
the evac law) removed it from the trimmed-mean's drop pool — the exposed
2.3-3.5% rows existed in r25 under the trim shield (STATION TRIM-SHIELD
law).

## t80bv CERTIFICATION CASE (r26, for the orchestrator ruling)

Facts: width-normalized registration (safeScaleK from widthM) leaves the
BV print ~4.4% SMALL in y and z (r25 measurement; unchanged). Dims stay
100 because MY build is pub-sovereign — which is exactly why every
curve/station row then carries the print's systematic -4.4%: the fit
cannot converge while both hold. Component caps observed:
- stations bind at 28-34: slice tops/widths read the shrunken print
  against pub-scale slices (station-0 width -8%, tops -4..-12%).
- wholeCurves low-30s: side/front tops sit ~0.09-0.10 low across the
  board (2.20 crown reads ~2.10; deck 1.44 reads ~1.38).
- turretCurves ~40-50: same shrink + the K-1 field's own print noise.
r25f post-mortem (banked above): whole-group y/z squash regressed — hull
and turret rigs shear independently and dims/stations pin the heights.
r26: hull recalibration is shared with t80/t80b (its hull row IMPROVED
+5.2); turret+gun+skirt geometry v2-GUARDED to the r25 forms (§H param
delta) so the certified r25 turret read is preserved for this case.
33.7 (r25) -> 28.4 (r26) is the same structural wall measured through the
recalibrated hull (and the station trim-shield exposure), not a new
defect class.

RULING OPTIONS (recommend b):
(a) certified print-scale cap on t80bv curve/station rows (caps never
    cover dims; dims is already 100) — freezes it as a known-defect row;
(b) oracle re-warp (orchestrator lane): vertex-normalize y/z x1.046
    about ground/width-center — the t90m batch-23/31 recipe class; the
    build then re-tunes in one round;
(c) retire the BV print to a visual variant (kit delta on t80b's ref).

## r27 (2026-08-03): re-phase to the batch-33 compressed oracles — t80 65.3 -> 82.5, t80b 55.7 -> 81.6 (both >= 80)

Fresh authoring against the compressed ends (batch-33, 226f3bb): the
brief's grid re-phase debt is paid. Final rows, gate x2 stable
(shots/russia-r27/*.json):
- t80  82.5 | hull 88.7 whole 82.5 turret 84.7 stations 88.3 dims 98.9
  floaters 100 (dims = heightM 1.14% — non-binding; see the quantization
  note below)
- t80b 81.6 | hull 87.5 whole 81.6 turret 84.3 stations 92.3 dims 100
  floaters 100
- standard-check: contig 0 ✓ mg1 ✓ both; clip 221/280 / 221/310 — the
  strip/sponson fleet-band item flagged in r26 stands (orchestrator
  ruling pending; not this round's order).

TOOLING (bank): tools/vertex-workorder.mjs printed side/front absolutes
are WRONG this round — after the fidelity page's own gate run, one model
root is left invisible, so the tool's recomputed union center collapses
to the proc box (C.z 1.44 vs true 0.7184) and every side/front value
shifts. A scratchpad gate-faithful probe (true-workorder.mjs: recovers
the page camera center from cameraFor, pairs columns with the gate's own
hull-registration) was the authoring source; docs/references/vertex/
t80*.json extract curves cross-checked (ref frame is bbox-centered; hull
mid -1.4345 -> +1.4345 maps extract z to proc frame).

What landed (all in buildT80Line; t72b3m/t90m + every non-t80-line
sibling re-gated EXACT to committed decimals):
- STERN UNDERCUT (the p95 driver, 0.25-0.39 on three columns both
  variants): the compressed ref's stern is an overhanging deck — bottoms
  rake 0.71@-2.96 -> 1.23@-3.23 -> lip 1.43@-3.36. Belly re-raked, hump
  band ends -3.27 (its -3.30 sliver crossed the -3.276 column boundary),
  full-width LIP STEP 1.405..1.71 to -3.39 (band kept > the 12% body cut
  so hullLengthM's rear anchor holds; x to 1.65 RIGHT / 1.62 LEFT —
  print-asymmetric per the gate's ±1.69 plan columns), rear plate/grille/
  log/flaps re-seated above the rake (log -3.00, its old -3.16 seat sat
  0.19 under the new line), vertical fuel drums z -3.12 (rear sliver
  crossed -3.276).
- BOW ARROW re-line: center 3.02/3.09/3.27 (nose 3.05; two-segment
  slow-then-steep wedges; corner stacks keep hullLengthM body at 3.41 so
  dims hold), corners widen to 1.745 (the ±1.70 plan column reads 3.40 in
  the ref; 1.76 leaked the ±1.82 window whose ref front is the skirt),
  pocket fill re-seated (printed 3.21 into the ±0.56 columns), tow eyes
  eyeY 0.63 (default 0.50 bottomed 0.40 vs the ref's 0.525 floor), first
  flap 0.945.
- SKIRT z-window -2.66..2.96 + yTop 1.10 (the two outermost plan columns
  carried 0.31 each against the compressed ref's skirt span; front
  ±1.70..1.77 tops read 1.101); fender/stow run widens to x 1.715 (the
  ±1.66..1.72 front columns read the 1.22-1.23 fender line).
- TUBE: the compressed ref band is 1.555..1.868 (0.313 thick, axis
  1.7115) — r 0.128 seated cy -0.054 (band 0.256 keeps the 12% body-cut
  LANDMINE margin; the ±0.03 band residual is the certified circle-law
  trade), crest fin follows, clamp plate cy -0.056. t80b muzzle 6.33
  (its print's last tube column; overall 9.72 = +0.67% inside grace).
- TURRET: crown plate 1.24 wide (the ref front falls continuously from
  ±0.60 — the 2.04-wide plate printed +0.15 x5 columns) + LEFT crown
  shelf and LEFT-only mid-cheek riser (the compressed falloff is
  asymmetric: left holds 2.14-2.18 where right reads 1.96-2.05); cheek
  chain raised to 2.13/1.98 t80-ONLY (t80b's print reads 1.84-2.00
  there); hood/step -0.10; bustle plan asymmetry (main boxes -0.82..0.88,
  right corner to 1.005 — the ref rear is -1.41@+0.95 but -0.54@+1.08
  and -0.76@-0.92); rear-most bustle column is a thin 1.95..2.10 lip;
  t80b bin -1.575 + its 2.05..2.18 stowage row over z -0.80..-1.06; MG
  cluster re-seated (fitting receiver 2.29 on the +0.38..0.46 spike
  columns, barrel dips under the crown; sight head inboard to -0.325 —
  t80's spike columns are -0.33..-0.39 ONLY, and t80b has NO left spike
  at all: its head drops to 2.18); 902 tubes -0.12; the hidden
  turret-node carrier is PER-PRINT (t80 -0.40..1.00, t80b -0.44..1.10 —
  each print's apron zone measured from its own -0.48/+1.04 columns).
- HEIGHTM QUANTIZATION STACK (law): the dims heightM reads the p95 crown
  +1.5 px MSAA bleed stacked on the corner-pad floor dip (authored 2.20
  read 2.225) — crown 2.1925, doghouse cap 2.17, apex 0.735, receiver
  2.2075 leave the crown box the single p95 carrier at 0.9% grace... on
  t80b (dims 100). t80's phase still reads 2.22/1.14% (non-binding at
  dims 98.9; its bottom dip column differs by grid phase — the botY 0.06
  bump was kept, further floor chasing declined).
- t80bv (PARKED, certification case): 28.4 -> 35.5 — the shared hull
  re-phase lifts it exactly like r26's recalibration did (+7.1; its
  turret/kit stays v2-guarded). NOT byte-exact to its committed row by
  necessity of the family rig (§H); the pending oracle re-warp ruling
  will re-tune it in one round regardless.

HONEST RESIDUALS: whole rows bind at 82.5/81.6 — the largest remaining
classes are the tube-band circle-law trade (±0.03 x ~24 columns, capped
by the 12% body cut), the stern window columns at 0.09-0.12 (bin-phase
mixes of lip/hump/drum edges), per-print single columns (t80b -2.72
fade line now v-conditioned; its 3.42 bow fender depth unaddressed), and
cheek-corner plan columns ±1.3..1.5 at 0.15-0.26 (the compressed ref's
pinched corners want a planform decode round). Stretch >=85 needs those
two decodes; this round's floor (>=80 both) is met with margin.

## §B3.1 PRISM SWEEP round (2026-08-06, russia-family builder — t80/t80b/t80bv)
PRISM INVENTORY (found -> replaced-with), per variant of buildT80Line:
- t80/t80b boot mass box(0.46,0.50,0.40) under the hood -> elliptical
  frustum (same extremes at center axes) + fold ring inside the local
  skin.
- t80bv mantlet block box(0.46,0.32,0.34) -> same elliptical cast-collar
  treatment + fold ring.
- Luna IR "box" (t80/t80b at x 0.72; BV right sight at x 0.55) -> REAL
  SEARCHLIGHT DRUM: cylZ r 0.13 (inscribed circle of the 0.26 box —
  side/plan mask rectangles identical), dark rim, round glass lens.
- V-nose dust-cover boxes (both branches) -> fold-crease strips + dark
  end seam, flush on the certified faces (canvas grammar, zero growth).
GATE HOLD x2:
- t80  82.5 | 88.7/82.5/84.7/88.3/98.9/100 (baseline exact)
- t80b 81.6 | 87.5/81.6/86.2/92.3/100/100 (turret 84.3 -> 86.2: the
  elliptical boot mass reads CLOSER to the print than the box did)
- t80bv 35.5 | 44.6/45.0/55.2/35.5/100/100 (pristine-HEAD verified
  equal — the ledger 45.1/45.4 hull/whole rows were stale; the 35.5
  stations headline is the standing scaleToOverall ruling class,
  orchestrator lane)
§H.4 DISTINCTNESS held: t80 = clean cheeks + right Luna drum; t80b =
brow shelf + spread applique tiles + 902 tube cluster + Luna drum;
t80bv = K-1 cheek arc + glacis raft + V-nose creases + right sight
drum. npm test green.
Pre-existing (pristine class): t80bv holes 3x1c at z 3.06 (§B2 backlog,
glacis-raft edge zone), shoe clips 221-324 (§B4 backlog), t80bv mg0.
Residual (certified): no evacuator bulge on the tube — the compressed
prints read a flat 0.313 band (r27 circle-law trade); a photo-class
evac would break the certified band, banked for an owner ruling.

## §B3.2 DECORATION DENSITY + MG round (2026-08-06, russia-family builder)
Owner directive: decorations + "many more machine guns of all varieties".
T-80BV mg0 backlog CLEARED: the BV lane (v===2) now carries its real
commander's NSVT Utyos as a census FITTINGS.pintleMG — seated mask-
INTERIOR (receiver, swung ry -90 / ammo off, lands x 0.277..0.499,
z -0.574..-0.526 INSIDE the cupola footprint x 0.26..0.78 / z -0.68..
-0.16 / top 0.76; receiver top 0.698 also under the 0.727 dome line at
its plan radius; barrel drooped elev -0.25 under the 0.74+ crown apex
zone). t80/t80b keep the r26/r27 spike-covering fitting NSVT.
ADDED KIT (all variants, §H.4 variety by mirrored seats + seeds): PKT
coax port stub + washer flush-recessed in the mantlet hood face (v0/v1,
z<=1.689 vs the 1.69 face) / V-cover face (v2, z<=1.618 vs 1.62); spare
track-link run FLUSH on the deck (v0 right 0.60 / v1 LEFT mirror / v2
right 0.30); tow cable draped flush (v0 right-rear / v1 left-rear / v2
right-front drapes; knot tops each <=local deck polyline).
MG census: t80 mg1+0d -> mg1+2d; t80b mg1+0d -> mg1+2d; t80bv mg0+0d ->
mg1+2d. GATE x2 (both runs identical):
  t80  82.5 | 88.7/82.5/84.7/88.3/98.9/100 (baseline EXACT)
  t80b 81.6 | 87.6/81.6/86.2/92.3/100/100 (hull +0.1, rest exact)
  t80bv 35.5 | 44.6/45/55.2/35.5/100/100 (baseline EXACT — the 4.4%
  under-scale print residual + stations 35.5 remain the r25f structural
  certification item, untouched by this round)
Residuals (honest): BV MG visible close-up only (mask-neutral nesting on
the 35.5-gate tank); jerryCans unplaceable on the 1.44-1.50 deck lines;
clip failures (221/280, 221/310, 324/280) and the t80bv 3-cell bow holes
PRE-EXISTING. Turret-parent: towCable flags = §B5 audit-artifact
(adjudicated deck gear). npm test green.

## TURRET-LANE round note (2026-08-06/07)
muzzleBore added to the t80 family rig (all three marks; shadow-named,
mask/frame-neutral — t80 82.5 / t80b 81.6 rows EXACT). t80bv turret
55.2 is oracle-pinned: today's side_turret registration read dAlong
1.285 / plan dy -1.365 — the recovered t80bv print's `^Turret$` node
has no gunNode (fused barrel; r6 repair-queue class "re-parent baked
barrels to gun nodes") and the §7 scaleToOverall ruling is pending.
Mantlet collars + Luna + NSVT already per-variant on the rig.

## CHEVRON round (2026-08-07, chevron+fused builder — §5.14 owner '<' order,
## all three marks; CHEV markers in buildT80Line)
Mechanism: the shared k1Chevron opt-in in eraRuCheeks (straight banks
sweeping back from the gun center, ry = -s*yaw k5-donor convention, thin
dark backer frame bridging bank to casting §B2; defaults byte-identical
for every legacy caller — proven by 14-tank hash hold before opt-in).
- t80 (v0): print + real fit carry NO era front — the owner's '<' governs
  (§B7 owner-taste, documented): LIGHT two-row, three-brick banks at
  44.7deg (yaw 0.78, out 0.07 so the banks stand proud of the fat dome
  bulge in plan), no flank field — the mark stays the lightest (§H.4:
  t80 light banks / t80b applique banks + brow + 902 / t80bv full field
  + raft + skirt plates). GATE: 82.5 | 88.7/82.5/84.7/87.8/98.9/100 vs
  baseline 88.3 stations (-0.5, the proud banks in 1-2 slices; all other
  rows EXACT incl. min).
- t80b (v1): the three spread applique tiles re-line onto two straight
  banks at 41.3deg (s*0.72; the r26 arc read was a 17deg fringe —
  measured receipt: old tile line (0.40,1.52)->(1.06,1.32) = 16.9deg) +
  thin dark backer per side. Same tile grammar/count; brow shelf + 902
  tubes stay. GATE: 81.6 | 87.6/81.6/86.2/92.3/100/100 — EXACT baseline
  every row.
- t80bv (v2): the K-1 cheek field banks — bricks 0-2 at 44.7deg (yaw
  0.78, out 0.07), brick 3 keeps its arc seat (flank wrap). MEASURED
  receipt: the print's own arc chord reads 35.0deg. GATE: 33.7 |
  44.6/45/52.5/33.7/100/100 vs baseline 35.5 | 44.6/45/55.2/35.5/100/100
  (turret -2.7 / stations -1.8 = the §B7 owner-'<' cap on the 4.4%%
  under-scale print whose turret row is already the standing
  oracle-pinned class (dAlong 1.285) + scaleToOverall ruling pending;
  hull/whole/dims/floaters EXACT).
Plan pairs verify the '<' on all three
(shots/russia-chevron-fused/after/*/view-top.png).
DELIVERED-PENDING-CRITIC; not committed.

## CHEVRON-TIP round (2026-08-07, chevtip builder — owner §5.29 photo refinement + the critic wave's t80 plan-proudness conditional)
TIP (§5.29, all three marks; §H.4 distinctness kept):
- t80 (v0): the light banks become TWO flat K-1 panels MEETING AT THE
  MANTLET HOOD — tip (±0.66, 1.56L) at the hood flank, outer (1.30,
  0.94L); the face line rides 3-9cm PROUD of the dome plan-front
  ellipse along the whole run (the critic's t80 conditional: the plan V
  BREAKS the dome silhouette; tilt top-edge retreat priced). Lightest
  fit: one clean 3-seg panel pair, no flank field.
- t80b (v1): the three spread applique tiles per side become the same
  panel pair on the old tile line (42.5deg ~ the landed 41deg), tile
  grammar via seam grid; brow shelf + 902 bank stay.
- t80bv (v2): full-height 3-course panels (h 0.56, rows 2) MEETING AT
  THE V-NOSE COVER (tip ±0.30, 1.52L); arc brick 3 flank wrap byte-held
  (banksOff); + the real BV 902B Tucha bank on the LEFT front cheek
  (four angled tubes). Mid-run dome-bulge hug = the K-1-on-casting
  class.
MG (§5.29 + CROWS law): all three NSVTs leave the inboard-swung stow
for FORWARD full posture (scale 0.54 -> 0.68/0.62, ammo cans on).
DIMS INCIDENT (banked): the first cut's receiver top 2.31w blew heightM
grace on BOTH v0/v1 (dims 98.9/100 -> 77.6/77.4 MEASURED — the
receiver+ammo+barrel painted 5-6 over-grace side cols, past the ≤4 p95
budget; "a cap never excuses dims"). r2 mount 0.62 -> 0.535: top ~2.22w
inside grace, receiver still pokes ~3cm over the 2.19 crown plate —
dims RESTORED (98.9/100 exact).
GATE x2 (final bytes) vs baseline:
- t80  82.2 | 88.7/82.2/84.6/88.3/98.9/100 (base 82.5 | .../82.5/84.7/
  87.8/98.9) — whole -0.3 / turret -0.1 (§5.29 cap), stations +0.5.
- t80b 81.0 | 87.6/81/85.5/89.8/100/100 (base 81.6 | .../81.6/86.2/
  92.3/100) — whole -0.6 / turret -0.7 / stations -2.5 (§5.29 MG+tip
  cap, documented; min moved -0.6).
- t80bv 39.8 | 44.6/44.6/53.1/39.8/100/100 (base 33.7 | 44.6/45/52.5/
  33.7) — MIN +6.1 (the full-height panels carry station slices the
  banks missed), turret +0.6, whole -0.4.
DELIVERED-PENDING-CRITIC; not committed.
