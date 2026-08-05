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
