# IS-6B — reference packet

Game variant of the IS-6 (Object 252/253) experimental heavy: conventional
sloped glacis (no pike), IS-2-style sloped rear deck, egg dome turret on a
visible ring collar, long 122 mm D-30 with a compact muzzle brake, 6 big
road wheels.

## Real dimensions (2 sources)
- Catainium's Tanks (http://catainium.blogspot.com/2016/03/is-6object-252object-253.html):
  IS-6 length 7.02 m (hull), width 3.43 m, 54 t, 122 mm D-30T.
- Tank Encyclopedia (https://tanks-encyclopedia.com/coldwar/soviet/is-6-object-253/
  and https://tanks-encyclopedia.com/is-6/): Object 252/253 ~54 t, 122 mm,
  torsion-bar 6-wheel running gear.
- Game spec `specs.js is6b.dims`: hull 6.9, overall 9.1, w 3.2, h 2.5.

## GLB oracle
`/models/tanks/community/is6b-snowleopard.glb` (Jt Steele / SnowLeopard101,
CC-BY 4.0). Gun fused into turret ⇒ loader normalizes on the FULL box: hull
rear-shifted in world (whole bbox centered).

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −4.92..+1.65 (len 6.57); roof: rear deck RISES 1.18→1.39→1.55
  over ~1.7 m (sloped engine deck), flat 1.53 midships, 1.47-1.49 forward,
  glacis 1.34→1.06 at the tip; plan 3.06 rear / 3.20 mid / 3.06 nose.
- front widths at y .35/.7/1.0/1.3/1.6/1.9/2.2:
  3.06/3.06/3.20/3.08/1.38/2.07/1.65 — note the NARROW 1.38 ring collar band
  at y1.6 under a bulged 2.07 egg at y1.9.
- turret: egg dome z −2.11..+1.1, crown 2.29-2.34 (z −1.05..−0.35), base y
  1.51-1.74 on the collar.
- gun: muzzle +4.94 ⇒ 3.29 m past the bow; tube y 1.82-1.98 (axis ≈1.90),
  compact brake at the tip (y 1.76-2.03 over the last ~0.4 m).
- whole len 9.86, top 2.34.

## Build notes
Oracle frame replicated (hull center z ≈ −1.64). Turret pivot near dome
center (z ≈ −0.5; GLB pivot cfg [0, 1.02, −0.37]). Dome is an onion bulge on
a narrow ring collar — lathe with re-entrant base.

## Final fidelity (2026-07-30)
72.3 → 90.1 — PASSES the 90/90 gate (H93 T87 G82 R92). Gun 82: the oracle's
brake blob is slightly taller/shorter than the buildGun drum + extra ring.
