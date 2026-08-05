# Centurion Mk.5/2 (`centurion5`) — reference packet

Exact variant: Centurion Mk.5/2 — first L7 105 mm Centurion (Mk.5 hull, ex-20-pdr mount).

## Corroborated real dimensions
- Hull length 7.56–7.82 m; overall length gun-forward ≈ 9.83 m; width 3.38 m;
  height 2.94 m (same chassis family as Mk.3).
  Sources: https://en.wikipedia.org/wiki/Centurion_(tank) ,
  https://www.iwm.org.uk/collections/item/object/70000144 ,
  https://www.tankmuseum.org/museum-online/vehicles/object-e1949-338
- Gun: Royal Ordnance L7 105 mm L/52 ≈ 5.46 m tube WITH bore evacuator at ~2/3 tube;
  overhang past nose ≈ 2.2 m.
- Running gear/identity: as centurion3 (Horstmann bogies, 6 wheels, full armoured side
  skirts, long cast turret with rear bin); the Mk.5's L7 tube carries the distinctive
  evacuator drum, unlike the slim 20-pdr.

## Local GLB oracle (m_bergman print pack)
Width-normalized reference: hull z −3.94..+3.56, hull top 1.74, whole top 2.20.
**ORACLE DEFECT:** unassembled print layout — turret at ground level, barrel never clears
the hull bounds → turret component structurally ~25, gun structurally ~0–20 for honest
geometry (same userdrops6.js articulated() issue as charioteer). Hull + tracks components
legitimate.

## Procedural gaps identified (before edits)
- Same as centurion3: hull band too low (1.50 vs 1.74), skirts missing, L7 overhang was
  1.25 m — should be ≈ 2.2 m with an evacuator for identity.

**Oracle re-processed (repair_oracles_blender.py): turret seated** — cast
turret carved from the print skin and lifted +8.5 onto the ring; the L7 tube
segments on the bore line lifted to the throat (muzzle keeps its authored
+3.9 station); flat-pack plates parked inside the hull.

## Mismatch log — shaded-parity r2 (2026-07-30)
- All centurion3 r2 fixes apply (shared centurionBuild): cupola/loader pedestals (RWS read
  closed), clamped tow cable, bustle bin, lifting eyes, antenna base pots, canvas mantlet
  hood, glacis kit, louvre field + link rack, skirt gaps + handles, dished wheels.
- L7 identity: the prominent FAT mid-tube fume extractor is layered over buildGun's slim
  drum (r 0.100 vs tube 0.053, with taper rings); evac at 0.62 of the tube.
- Mk.5/2 now visibly differs from Mk.3: full 2x6 double-row smoke discharger banks per
  cheek (Mk.3 carries triples) + canvas stowage baskets on both bustle flanks.
- G stays 15: the repaired print keeps only partial tube segments on the bore line (cap;
  honest 5.45 m barrel kept). Fidelity 73.1 vs 73.4 committed.

## Round-3 log — oracle re-repair + re-seat (2026-07-30)
- ORACLE RE-REPAIRED from .bak: the r2 state ("L7 lies detached across the glacis") was a
  carve artifact — in the print the L7 is CO-AXIAL with the casting (bore x15.37 y12.60,
  muzzle authored at bow+3.9) and the whole TurretMesh is one assembled turret. The old
  recipe parked the entire casting inside the hull and lifted only tube slices. New
  recipe = one rigid move: basket ring c=(15.374,23.400) r7.0 onto the race
  c=(16.900,41.870) r7.2, dx +1.526 dz +18.470 lift 6.5, pivot [16.90,15.8,41.87].
  One assembled tank in all 9 views; fume extractor + discharger clusters all present.
- Headline 73.1 -> 75.8 (T 56.8* -> 59, G 15.2* -> 44 honest).
- Procedural: turret pivot -0.12 -> +0.40, gunLength 5.45 -> 4.98 (muzzle keeps the
  print's +6.0 station); cheek dischargers rebuilt as dark twin BINS per cheek on bracket
  arms (r2 "bead necklace" + "solid slab with surface tubes" both closed).


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
Same shared ukHull fender-wedge fill as centurion3 (see that packet): the
fender-over-glacis sky wedge is closed with lofted mudguard solids. Gate v11
before/after byte-identical (hull 46.4 whole 27.2 turret 24.3 stations 74
dims 100 floaters 100). Evidence: shots/plate-fill-r1/centurion5-{before,after}/.

## Vertex round r1 (2026-08-03, uk agent)
Full retable against REGISTERED PARITY TABLES (tools/tmp-uk-parity.mjs ->
shots/uk-r1/centurion5*/; the gate's own hull-row registration applied to
both masks — extract z-frames are NOT trusted for placement on this family).
STALE CERTS RETIRED: (a) "basket band bottoms 0.65 over z -0.7..+1.2" — the
re-repaired print's basket reads bottom ~0.65-0.68 over z -0.10..+1.47 ONLY,
with the casting bottom at 1.54 around the ring; (b) "no tall masts" stands;
(c) the print's END WHEELS are RAISED (idler rim tip ~3.85, y-center ~1.03;
sprocket rim tail ~-3.7, y ~1.06-1.15) with long climbing runs — the ground
line ends ~±2.4 and the rims own the silhouette past the hull plates. Hull:
24-inch track band |x| 0.94..1.55, belly 0.53, stepped driver plate
(1.69 deck -> 1.51 glacis flat -> vertical nose at 3.48), engine deck
ceiling 1.755 (all furniture under it), fender lid ends 1.60/skirt top 1.48.
Turret: slab-walled casting (walls ±1.16, crown 2.55-2.64), cupola at the
print's own peak zone (x -0.48, world z -0.15) carrying the 2.92 p95 anchor
(print peak 2.79-2.85 — bounded anchor tax ~4 pts across side rows), WIDE
flat bustle ±1.15 ending world -1.71 (mk5), flank stowage shelves to ±1.54
(rounded outer stub 0.6 m), roof MG pintle (owner decoration law), L7 tube
Ø0.28 with muzzle collar to the tip. TRACK CONTAINMENT LAW (owner
2026-08-03): rake lofts narrowed to ±0.88 (rakeHalfW), horn plates outboard
x 1.59..1.70 ending before the wrap crown, sprocket y capped 1.06 under the
fender, flap hems above the rim line — audit 1233/1178 vox -> 0/0.
Numbers (r0 -> banked): min 24.3 -> 66.9 (hull 46.4 -> 85.1, whole 27.2 ->
70.7, turret 24.3 -> 66.9, stations 74 -> 81.8, dims 100 -> 98.3 [hullMask
~7.58 = +0.3% grace], floaters 100). Mask-end law: band+shoes render ~0.57
beyond each end-wheel center — calibrate idler/sprocket z against it.

## vertex r2 (uk family, 2026-08-03) — extract-true turret rebuild: 66.9 -> 80.8
The r1 "registered tables" carried four mis-reads the extract exposes
(local z = extract + 0.883): the under-ring basket sat +0.24 forward
(true: 0.651 world over local −0.49..+0.90, ring-centered), the cupola sat
0.3 too far rear (print dome peak 2.848 at x −0.48, local −0.19..−0.30),
the 2.747-2.754 CROWN RIDGE (left-biased, x −0.91..−0.20, local −0.90..
−0.49) was missing, and the bustle roofline is a STEPPED profile (dip
2.488 at −1.02..−1.08, crest 2.55-2.60 to −1.54, rear flat 2.386 to −2.13)
with 1.49/1.53 ring-collar bands each side of the basket — not a flat
2.55-2.64 slab. Bustle authored as a mark-parameterized loftBand + wall
boxes (asymmetric: LEFT to x 1.25, right 1.21; walls floor at the print's
1.78 line, never below); rounded plan rear (full-width to −1.63, inner
sliver to −1.77, center-only tail to −2.09 local).
HULL side re-reads: the MAIN skirt plane lives in the ±1.561..1.599 front
column (sk.x 1.61 with the shared 5 cm panels), an OUTER armour strip rides
at ±1.679..1.6895 (front band 1.31..0.81, SEGMENTED — prism law — 9 panels
to z −3.13), fender horns run to 3.70 INSIDE the ±1.675 column, mud flaps
at the ref's −3.12 plane, sprocket z −3.075 (wrap rear −3.635 = ref mask
end), tracks 0.575 wide (the r1 0.61 band's shoes lit the ±1.58 columns to
ground where the ref reads skirt hem), tail lip rail 1.21..1.48 at −3.62.
WIDTH GUARD lesson: an 8 mm strip overshoot (1.705 > 1.6895) rescaled the
whole build 0.991x and cost 4.6 dims + ~3 pts on every curve row.
Numbers: min 66.9 -> **80.8** (hull 85.1 -> 82.3, whole 70.7 -> 80.8,
turret 66.9 -> 81.8, stations 81.8 -> 82.6, dims 98.3 -> 100, floaters
100). Track-clip --exact 0/0. Boards: shots/uk-r2/centurion5.

## r4 analysis note (2026-08-04, uk agent — NO BUILD EDITS, byte-stable 80.8)
Chieftain5 consumed the round (80.4 -> 91.4 PASS, the family's first);
centurion work stopped at analysis per the honest-budget rule rather than
risk a half-landed retable. Paired workorder decode (BOTH marks; the
fidelity scene places ref ~-0.6 / proc ~+0.58 in z — pair ref[z] with
proc[z+1.233]; law #7 in the chieftain5 packet):
- GLACIS/idler-wrap band, proc-frame z 3.10..4.21: proc tops 1.573..1.727
  vs ref 1.48..1.54 (+0.06..+0.185 over ~8 hull columns, both marks). The
  1.60-1.73 line is the RAISED-IDLER track wrap (idler y 1.03 r 0.38, top
  = y+r+0.135+shoe) plus the flat 1.505-1.51 deck run — the ref wrap tops
  ~1.48-1.51 (its idler reads lower/tighter, ~y 0.98 r 0.345) and its
  glacis keeps falling to a 1.20 tip where proc holds 1.08 (tip -0.12).
- DOME/cupola zone (proc z 0.39..0.88): proc 2.93/2.87 vs ref 2.776..2.837
  (+0.09..+0.19, 3-4 columns, both marks) — the dome peak wants ~2.84.
- Forward crown/face zone: c5 ±0.03-0.09 mixed; c3 confirmed the
  orchestrator's 0.10-0.13-lower face read — split the shared mid-casting
  slab tops per mark (the mk===5 ternaries already exist at the -0.60
  station; the face-zone pair needs the same treatment).
- TAIL: ref rear overhang bottoms 1.23@-3.067(proc-frame)..0.62@-2.82 vs
  proc sprocket-wrap 0.89..0.59 (-0.10..-0.34 on 3 columns): the ref tail
  plate hangs a HIGH shelf over the sprocket; author a rear overhang like
  chieftain5 r4's (band ~1.2..1.7 at the wrap line).
- Muzzle: proc tube band 2.066..1.82 vs ref 2.066..1.758 (r 0.123 vs
  0.154, axis 1.912 vs 1.943): drop the gun axis ~0.03 and fatten the
  tube ~0.03 (raycast the print first — chieftain law: mask reads
  under-report the axis).
Estimated +3.5-5 pts from the glacis/idler + dome + tail set; stations
82.6/78.9 should ride the same fixes. Start by pinning each model's world
offset with tools/tmp-ukr4-probe.mjs root boxes (kept for r5), THEN author
from paired columns only.

## r5 (2026-08-05, uk agent — the written order executed): 80.8 -> 85.4
FRAMES PINNED FIRST (per the r4 instruction): probe root boxes put PROC at
build coords exactly (box -3.691..6.102); REF sits in its extract frame —
**build z = extract z + 1.233** (the gate dAlong), and the workorder's
printed frame = build + 0.586 (shared-box-center offset; the r4 note's
"proc-frame" values are printed-frame). The vertex extract curves are the
authoring source; the raycast probe is the proc-truth check.
ALL FIVE r4 ORDERS DELIVERED (per-order done-gates):
1. GLACIS/IDLER: deck retabled to the extract — flat 1.658 (0.35..2.05),
   1.70 cable-pad zone, driver step ONE RAKE 1.693->1.512 over 2.44..2.56
   (NO-STAIRCASES: replaced the old 3-knot quantized fall), glacis
   1.483->1.462; driver hatch lids moved ONTO the glacis (they stood at
   1.70 over the fallen plate = the +0.15..+0.20 columns); mk5 periscope
   hump 1.557 at 2.60 (ref 1.564); headlights/links/splash rail under the
   1.48 line; idler y 1.03->0.96 r 0.38->0.345 (wrap crown 1.60->1.50, ref
   1.47-1.51); falling horn-tip courses 1.40@3.68 -> 1.24@3.80 -> thin
   1.19..1.13 sliver at 3.87 (ref 1.364/1.242/1.188). Band cols now ±0.03.
2. DOME/CUPOLA: round stack dropped to the ref's 2.85 dome class (base
   ring 2.695, body 2.795, lid ring 2.85); the published-height p95 anchor
   moved to a NARROW COMMANDER-SIGHT VANE (0.06 x-wide, 0.40 z-long at
   2.92, z-aligned with the ref's 2.837-2.848 spike zone) — heightM 2.91
   (0.87% grace, dims 100). MG re-seated as a stowed KIT fitting; gunner
   sight 2.57 / periscope hoods 2.445 & 2.65 (ref 2.558/2.429/2.649);
   crown ridge widened to x -0.95..-0.03 and z-extended to local -0.92.
3. FACE ZONE: measured split — the shared periscope hood was the offender
   (mk ternary y 0.63 c5 / 0.565 c3), casting slabs were already true.
4. TAIL: r4's rear overhang authored — full-width (±1.575) shelf in THREE
   monotone raked courses (tops 1.664@-3.40 -> 1.618@-3.51 -> 1.575@-3.585
   -> 1.372@-3.675; bottoms 1.34/1.20/1.25 — course A clears the wrap
   crown by 30 mm, containment); sprocket refit to the ref circle
   (z -2.95, y 0.99, r 0.36: wrap bottoms 0.843@-3.48 EXACT, tip -3.50);
   tail deck courses 1.75@-3.16 -> 1.664@-3.40. Tail bottoms ±0.05 (were
   -0.10..-0.34).
5. MUZZLE: gun axis 1.935 -> 1.905 (print raycast 1.907-1.910 BOTH marks;
   the r4 "fatten the tube 0.03" was mask AA — raycast r ~0.14 matched our
   collar already; chieftain law vindicated). The L7 extractor drum is
   TOP-BIASED in the print (band 2.097..1.758 = drum axis +0.022 over the
   bore): authored as an OFFSET drum (r 0.171) replacing buildGun's
   axis-centered evac.
LAW DISCOVERIES (bank):
- TWO-THRESHOLD END-WINDOW LAW: the hull-anchored REGISTRATION span drops
  columns under ~12% of the HULL-mask height (0.21 here) while hullLengthM
  uses 12% of the WHOLE-mask height (0.353): end-window content BETWEEN
  the thresholds serves dims without touching dAlong. Content above both
  flipped one reg column and shifted EVERY side row +0.5 pitch (dAlong
  1.237->1.298, §C stray-column class — cost turret rows ~4 pts until the
  horn tip was thinned back to the ref's own sliver). Fixed at 1.237.
- P95-ANCHOR X-COST: a height anchor pays in EVERY view it silhouettes —
  the old x-wide cupola ring paid ELEVEN front columns (+0.17); a z-long
  x-narrow vane pays two (front_whole 78 -> 85 with the rest of the round).
- FLOATER SEAT LAW: raised fitting rows must overlap their shelf tops
  (a +0.06 smoke-row raise floated both banks and failed the pose gate).
- WALL Z-SPLIT: side-dip vs front-crest conflicts split flank walls in z
  (dip-low front seg local -0.92..-1.16 at 2.48, crest-tall rear seg
  -1.16..-1.57 at 2.60 = the ref's front 2.58-2.61 at |x| 1.05..1.25).
NUMBERS (r4 -> r5, gate x2 byte-stable, third run after the MG fitting
migration identical): min 80.8 -> **85.4** (hull 82.3 -> 88.2, whole
80.8 -> 85.4, turret 81.8 -> 85.9, stations 82.6 -> 86.9, dims 100
[heightM 2.91/0.87% grace, hullLengthM 7.52, overall 9.80, width 3.38],
floaters 100). Track-clip --exact 0/0; turret-parent 0/0/0; standard-check
contig 0 + mg1 (FITTINGS.pintleMG M2, §H4 tell vs the Mk.3's MAG); hash
976a8289 -> 9e61f688. Evaluator rig-parity clean (yawProxy <=1.6°),
boards shots/visual-eval-centurion5/.
CERTIFIED RESIDUALS: the vane anchor tax (4 side cols +0.07..+0.19 vs the
2.71-2.85 plateau/spike — dims sovereign); c5 zb 1.28 col -0.087 (ref
discharger shoulder vs bin edge; extending the bin re-prices the bump
zone, net-negative); station-0 width 5.57 (trim-dropped; ref tail reads
3.13-3.2 wide vs our 3.27 flaps+shelf); gun-run ±0.02-0.06 wobbles.

## r6 (2026-08-05, uk agent — the 90 push): 85.4 -> 87.2 (hull 91.4, whole 89.4)
WORST-ROWS-FIRST from fresh gate worst-12s + a 384px gate-replica dumper
(tools/tmp-uk90-dump.mjs, §D-compliant: camera-matrix world decode, no
center guessing) + tmp-ukr4-probe raycasts. Six edit batches, all verified
against the official gate between batches. Row trajectory (r5 -> r6):
side_hull 89.1->91.4, plan 93.7->94.7+, front_hull 88.2->93.6+,
front_whole 85.4->90.6, turret_plan 88.2->96.9, stations 86.9->95.5,
turret_side 85.9->87.2, side_whole 88.0->89.4. DELIVERED:
1. RAMP-PAD GROUND DIP (the stations key): tilted approach/departure pads'
   corners dipped to -0.016 (probe: LOD pad instances at [1.24, -0.008,
   2.544]) — visibleBox.min.y biased EVERY station top +0.55% and the
   front rows' procBottom read -0.03 vs the ref ground. New buildRunningGear
   opt-ins (byte-identical defaults, selftest green): padCornerFloor
   (rotated-corner clamp), ramp-hug (tilted pads track the band bottom
   within 15 mm; z-gated by padHugZ0 — front idler shoulders hug, rear
   sprocket keeps the shoe hang the ref shows). Stations 86.9 -> 95.5/96+
   with station tops now 0.1-0.7% (s6/s7 = the vane pair, trimmed).
2. STATION WIDTHS DECODED: the ref's 14 station widths ALTERNATE
   3.318/3.375 — its outer strip is a CONTINUOUS 1.659 plate with 1.6875
   mounting BOSSES; the r5 9-panel 1.6895 run read +1.7% on every gap
   station. Rebuilt: 12x0.4675 panels at 1.649..1.659 (§C end-cap law) +
   six 0.25 m bosses at the proc station centers (width-guard carriers).
   Station-0 width residual DISSOLVED (5.57 -> 0.89: flaps rebuilt at x
   1.548..1.605, rear face -3.065, tops 1.475 = the ref's skirt-top line).
3. FRONT DECK NARROWING: ref front-view tops read 1.638-1.657 outboard of
   |x| 1.0 — the full-width 1.75 rear-deck loft face paid +0.09 on ~20
   front columns each mark. ukHull deckSplit opt-in (rear band top face
   pulled to ±1.005) + segmented 1.656 engine-deck side plates; tow-cable
   ends/cleats pulled inside the 1.002 column boundary (§C AA law).
   front_hull 88.2 -> 93.6 (c5) / 94.1+ (c3).
4. TURRET PLAN RETABLE (turret_plan 88.2 -> 96.9): live paired columns put
   the ref's discharger banks raking DOWN-FORWARD to a 1.71/1.67 plan
   front at |x| 1.05/1.16 (probe: TurretMesh) with side tops falling
   2.52@1.16 -> 2.39@1.28 — rebuilt as inner cap (x 0.92..1.10, 2.515
   flat to build 1.15) + raked slab to (2.02, 1.60) + low outer slab
   (1.10..1.185, under the ref's 2.26 front line) + tip plate to 1.71.
   Bustle plan-rear ROUNDED to the live columns (rear -1.49 build at |x|
   0.91..0.95, -1.62 at 0.78..0.88, -1.75 at 0.66..0.72 via loft-end
   -1.90 + width-stepped strips; tail box to -1.84 center). Shelf split
   A1/A2/B with side-split rear TABS (bottom 1.785 — full-depth rears
   hung 1.70 into the -0.79 side columns; left tab -1.10/right -1.03,
   the print leans left). Walls re-seated x -1.238..-0.905 / 0.90..1.185
   (ref left crest reaches the -1.24 column at 2.52; right ends by 1.19);
   posts kept at the r5 -1.695 (the ±1.05 plan column wants -1.42 — the
   r6-early single-ray -1.30 trim was a column-vs-ray misread, reverted).
   Nose/chin plan-tapered (ref fronts 1.82@0.56, 1.65@0.68 — bottom quad
   to ±0.40/±0.50, chin front 1.47). Crown ridge x -0.90..-0.055 + 2.60
   step-tab to +0.005 + the RIGHT-REAR SIGHT RISER (0.45, top 2.69, build
   -0.44..-0.55 — the ref front's 2.69 at x 0.37..0.52, probe-pinned,
   side-invisible under the 2.732 ridge plateau).
5. TRACKS: contact patch pinned contactZF 2.50 / contactZR -2.32 (ref ramp
   feet from column-min fits: 0.5/m front, 0.57/m rear — the r5 defaults
   read the ramp bottoms -0.06..-0.13 on 7 side columns); sprocket r 0.37
   (cert col -3.48 bottoms 0.84 EXACT, crown clears the shelf 15 mm);
   idler untouched. Driver-step rake to [2.49, 1.512] (live 1.532@2.48
   column) with the mk5 periscope hump clear of the 2.60 boundary; nose
   tip 3.458 (ref plan 3.454); tail C-course to -3.64 (ref center rear
   -3.62..-3.64) + flank exhaust-corner stubs to -3.69 (ref -3.69 at
   |x| 1.47..1.575); tail lip rail inside the C-course.
6. L7 DRUM: live band 2.115..1.776 from build 3.13..3.80 — offset drum
   (y +0.0405, r 0.170) with tightened tapers; the r5 0.36-long drum left
   the 3.5-3.75 columns -0.04 on both edges. Hood tilt -0.42 (ref falls
   2.115 -> 2.05 across its run); basket floor 0.666; gunner sight 2.545;
   right periscope hood 2.51@build 1.03..1.15 (live re-read of the r5
   2.445 seat).
MEASURED CEILING (documented, unresolved): turret_side cover 1.96/2.08 =
~2 interp-null gate columns where the REF GUN's last kept columns (its
hull-span+0.6 trim window) pair 1-4 mm past the PROC turret trim window —
the dAlong 1.237 = 10.03 column pitches, so the last ref column always
lands a fraction past the last proc column (interp needs BOTH neighbours;
registration-grid phase, not geometry). Two sliver-extension attempts
(hull span end 3.905 -> 3.945) did not clear it at the 1024 grid; a
half-pitch dAlong shift is the §C poisoning class, so this is priced as
the round's structural residual (~2.9 pts on turret_side, the 90-blocker)
pending an orchestrator-level look at the trim/interp boundary. The VANE
tax re-measured: 2 cols +0.17 + 2 cols +0.06-0.07 (placement re-verified
optimal for the 4-column p95 anchor; heightM 2.91-2.92 inside grace after
the vane +0.015 raise that paid the pad-floor bottom lift back to dims
100).
NUMBERS (r5 -> r6, gate x2 BYTE-STABLE — two identical runs): min
85.4 -> **87.2** (hull 88.2 -> 91.4, whole 85.4 -> 89.4 [side 89.4/plan
94.7/front 90.6], turret 85.9 -> 87.2 [side 87.2/plan 96.9], stations
86.9 -> 95.5, dims 100 [heightM 2.91, hull 7.52, overall 9.80, width
3.38], floaters 100). Track-clip --exact 0 front / 20 rear vox (the r 0.37
sprocket grazes the tail-rake loft AABB — inside the kv2-graduate <=60
band; r5 was 0/0, priced against the -3.26..-3.51 wrap-bottom gains).
Turret-parent 0/0/0; standard-check contig 0 + mg1 (M2 fitting). npm test
green (166 equipment checks + track-geometry selftest — the tankFactory
opt-ins are byte-identical by default: graduate hashes chieftain5
5117b9a8 and challenger1 a18d91a8 re-verified EXACT post-edit; fv510
a55c85cc, vickers_mk1 1389d11c, comet 8c9a2098, challenger_cruiser
d19f7994, charioteer c6fc76a8 recorded). Hash 9e61f688 -> bbcf7d80.

## r7 — COMBINED UK TONE ROUND (2026-08-05, uk agent; answers shaded-parity r6 f04beee)
Shared family recipes (ukToneKit + ukGearAirBackers in uk.js, §F.2
opt-in — chieftain5 untouched) with three measured dial cycles. Gate:
**90.5 -> 90.5 PASS x2 bit-identical** (hull 92.6 / whole 90.7 / turret
90.5 / stations 95.5 / dims 100 / floaters 100 — the a20e801 floor line
held EXACTLY with all deliveries in). Hash bbcf7d80 -> **2395a924**
(48 meshes, 73 004 verts). ORDERS:
- O1 EXPOSE THE GEAR (the 5.5-floor setter): ukHull gains the
  skirtHemSplit opt-in (default byte-identical — chieftain5/c3/fv510
  proven by hash) — the Mk.5 raises panels 0..4 to the ref's own 0.84
  exposed-disc hem (outer-strip bottoms 0.81 per the r2 tables; wheel
  tops 0.85) while panel 5 keeps the 0.60 hem that owns the front/rear
  row minima (interval-mask law — the chieftain5 LEFT-HEM-PARITY
  silhouette-neutral recipe; side bottoms are ground-run-owned).
  Wheels re-toned 0x3e4531 + rehook, drums 0x373d2c (O2b pale-bullseye
  kill), tires emissive-floored, /shadow/ bay backers behind the wheels.
  MEASURED: left band med 54.5-with-p5-6.8 -> 56.7 vs ref 51.8, sd 18.3
  -> 8.1; six full disc faces read under the raised hem (crop banked at
  shots/uk-tone-combined/c5-gear-after.png).
- O2 TRACK/WRAP TONE: pads 0x272b20/.18 + chain 0x2f3427/.22 + band mul
  [.92,.98,.82] + gearFloor rehook. Horn/pad row p5 6.8 -> 53 (no black
  teeth); ground strip p95 68.2 -> 66.9 med 53.7 (ref 51.4); front wrap
  faces med 28.6 -> 53.6 vs ref 55.5 (sky check unchanged 0 px — the
  columns were always geometry).
- O4: (a) hood retone via canvasCloth 0x353c2b/env .05 — rgb (64,65,47)
  p95 89.7 -> (54,57,43) p95 72.4 (target <=73; the feature kept);
  (b) glass smoked dark-olive — all three chips b-r +7 -> -4..-6;
  (c) muzzle: collar shortened 8 mm + dark bore disc (r 0.118) seated
  with its face AT the original gunLen plane (a 3 mm-proud first cut
  moved dAlong 1.237 -> 1.238 and smeared every side column — withdrawn;
  mask tip byte-exact now).
- O5 REAR DRESSING: tow cable draped across the tail plate in the ref's
  double-U (KIT.towCable riding the stepped course faces, max rear z
  -3.632 inside the -3.64 C-course line) + end cleats + one spare-link
  plate per shoulder flat on the B face; flank basket outer walls
  rebucketed 'turret' -> 'turretDark' on the Mk.5 (the plain-pale-slab
  read; mask-identical — thin slat strips at x 1.469 partial-pixel-lit
  the 1.4625 stub-column boundary and were withdrawn per §C).
- O6a M2 READ: the r6 mask-proven foot kept EXACTLY; rotation-only
  re-pose (yaw pi+0.95, elev 0.05) sweeps the barrel across the pale
  bustle dip under the left-biased 2.7475 crown-ridge front columns (a
  raised-foot pose put the receiver +0.10..0.14 over six x 0.13..0.32
  front columns — front_whole 90.7 -> 89.0 — and was withdrawn).
  O6b drum tell: evacuator BODY -> gunDark (§C material split at the
  gate-priced geometry; taper rings keep scheme paint) — the Mk.5/2's
  canonical band reads vs the Mk.3 at garage distance.
CHECKS at close: standard-check PASS (clip 0/20 documented class,
contig 0, mg1); turret-parent 0/0/0; npm 166 green; gate x2
bit-identical. Frozen proofs as challenger1 r8 section. Evidence:
shots/uk-tone-combined/ + shots/critic-centurion5/ (fresh pairs).
HONEST RESIDUALS: O3 (cast-turret §B1 slab grammar) NOT taken this
round — 0.5 turret headroom mid-critic makes it the orchestrator-
scheduled follow-up; the O2 horn/pad row med 65.9 sits +14 over the
ref's 52 (the wheels' lit lower arcs dominate the row — in-family, sd
9.6 vs ref 5.1); hood med 54 is 2L under its (56,62,47) target.
