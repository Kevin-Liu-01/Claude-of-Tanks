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
