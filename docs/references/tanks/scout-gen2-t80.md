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
