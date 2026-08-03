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
