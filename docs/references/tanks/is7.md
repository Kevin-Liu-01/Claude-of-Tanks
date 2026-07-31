# IS-7 (Object 260) — reference packet

Soviet post-war super-heavy. Signature cues: enormous rounded "frying-pan"
turret with a long sloped rear, pike-nose bow, 130 mm S-70 with a huge muzzle
overhang (~3.3-3.8 m past the bow), 7 big road wheels per side with no
return-roller gap, very wide (3.4 m) low hull.

## Real dimensions (2 sources)
- Wikipedia (https://en.wikipedia.org/wiki/IS-7): 68 t, 130 mm S-70,
  7 road wheels on torsion bars, 1,050 hp M50T, 60 km/h.
- Tank Encyclopedia (https://tanks-encyclopedia.com/coldwar/USSR/is-7-object-260):
  hull ~7.38 m, overall ~11.17 m gun forward, width 3.4 m, height ~2.6 m
  (page 403s from CLI but figures match the game spec row sourced from it).
- Game spec `specs.js is7.dims`: hull 7.38 m, overall 11.17 m, w 3.4, h 2.6.

## GLB oracle
`/models/tanks/community/is7-snowleopard.glb` (Jt Steele / SnowLeopard101,
CC-BY 4.0). Gun fused into turret ⇒ loader normalizes on the FULL box:
in world frame the hull sits rear-shifted (whole bbox centered).

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −5.04..+1.51 (len 6.55), roof flat 1.39-1.43, glacis drop over
  the last ~0.9 m to 1.08 at the tip; plan width ~3.27 full length.
- front-view widths at y .35/.7/1.0/1.3/1.6/1.9/2.2/2.5:
  3.00/3.18/3.29/3.02/2.54/2.40/1.18/0.31.
- turret: long egg dome z −3.6..+0.9, crown plateau 2.19-2.30 (z −2.3..−0.6),
  base y 1.41-1.61, cupola/AA MG spikes to 2.59 near the rear.
- gun: muzzle z +5.06 ⇒ 3.55 m past the bow, tube y 1.63-1.80 (axis ≈1.71),
  brake tip slightly fatter (y 1.61-1.82) over the last ~0.4 m.
- whole len 10.09, top 2.59.

## Build notes
Procedural build replicates the oracle frame (hull center z ≈ −1.76) so the
raw-frame gun-overhang extraction lines up; turret pivot at the dome center
(z ≈ −1.33), matching the GLB's authored pivot cfg [0, 1.08, −1.37].

## Final fidelity (2026-07-30)
64.6 → 89.0 (H90 T81 G94 R92; overall 90.2, min view ~87.9). Remaining gap:
the oracle's turret component keeps a wide skirt band below my hull roofline
plus a thin tall glacis stub that its hull mask carries between probe
stations — both push its upper/hull mask centroids in ways a cleanly
partitioned procedural rig can approach but not fully match. Custom brake
kept at Ø≈0.21 per the oracle (not the huge historical S-70 slotted brake).

## Shaded-parity r2 (2026-07-30)
89.0 → 88.9 (H90 T81 G96 R93). Surface pass per docs/critique/shaded-parity-r1.md:
sealed trunnion-axis saddle mantlet w/ bolt-bump rings (the r1 collar box slot
at −6° is gone — verified in the articulation strip), cupola vision ring,
loader lid, twin dark-metal KPVT AA mount, cheek SGMT MG ports, pike weld
beads + tow hooks, rear-corner exhaust ports, deck-edge fender bins, grab
rails, lifting bosses, headlight guards, dark wheel-face contrast.
Mismatch log: the oracle keeps its broad turret skirt band (T holds ~81 as
committed); rear bins are held to z < −3.5 so the yawed egg never sweeps
them; track sag left as committed (R93) — end-connector greeble skipped.

r3 (shaded-parity r2 #2/#3 artifact audit): 88.9 → 89.0. The "raised chevron plaque on
the pike center" was the yawed pikeNose cheek plate's corner piercing the upper wedge
face, and the "thin rod lying diagonally on the right pike face" was the offset weld
bead — both deleted via pikeNose cheeks/welds opt-outs (no IS-7 carries either fitting).
Pike quarter-read held (masks flat).

r4 curve pass (2026-07-31, profiles/is7.json): 89.0 -> 89.2 (T81->82, R93->94, minView 87.2).
The curves showed the casting keeps near-full width all the way aft — a second squashed lathe
now fills the rear quarter the single egg tapered away; wide cheek lift-eyes at the measured
±1.2, rear jack column, KPVT rack kept narrow (a wide platform slab + wide base skirt were
each tried and scored WORSE across views — reverted per the two-pass rule); mud flaps raised
off the open corners; idler tucked to the measured high seat. Plateaued 89.0-89.3 over three
passes — the remaining gap is spread across the quarter views of this fused print (turret
mask carries the gun).

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 26.0 whole 25.0 turret 21.3 stations 49.0 dims 99.3 floaters 100
Dims vs published: ALL <=1.4% - heightM 2.62 hullL 7.46 overall 11.25 width 3.41 (gate: 2.63/7.49/11.29/3.29).
Oracle audit (v6 true cameras, width-normalized frame): print SHORT: hullLength -10.9% (6.574), overall -9.5% (10.114), height -6.4% (2.434), width self-measure -3.3%.
Certified oracle-defect caps (component | ceiling | cause):
- hullCurves/wholeCurves | ceiling ~25-40 | published 7.38 hull must overhang the 6.57 print at both ends (pike +0.52, tail -0.32) and the published 11.17 muzzle reaches 0.73 past the print's - v6 both-direction coverage charges every overhang column
- turretCurves | ceiling ~21-35 | fused print turret (pre-existing cap) + the raised published-height dome (crown 2.35 vs print 2.25) and KPVT at the 2.60 p95 seat
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 37.7 whole 23.3 turret 0 stations 45.2 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.61/2.6 (0.47%) hullLengthM 7.44/7.38 (0.83%) overallLengthM 11.21/11.17 (0.32%) widthM 3.4/3.4 (0.13%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 2.441 vs pub 2.60 (-6.1%), bodyLen 6.536 vs 7.38 (-11.4%)
Cap verdict: HOLDS — the 9-11% SHORT claim re-derives to -11.4% length / -6.1% height; irreducible plan/side conflict vs published dims
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.
