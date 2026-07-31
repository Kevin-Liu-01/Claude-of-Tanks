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

## Shaded-parity r2 (2026-07-30)
90.1 → 90.5 — passes the 90/90 gate (H92 T88 G85 R92). Surface pass:
compact D-30 brake rebuilt as a dark-slotted double drum sized to the oracle
blob (G 82→85 — it finally reads as a brake); cast saddle + coax port at the
trunnion; dark collar seat seam under the onion dome (the "melts into the
deck" read); low-profile hatch rings + seams, DShK ring mount, periscope
pods, lifting bosses (all ≤2.40 — the oracle carries no spikes, T 87→88);
IS-2-style louver rows on the sloped rear deck; strapped fuel drums; bin
latch straps + toolbox + shovel; driver hatch seam + periscopes; bow tow
hooks + headlight guards; dark wheel-face contrast. Mismatch log: the
oracle's brake blob remains slightly taller/shorter than the twin-drum
build — G caps ~85; dome fittings deliberately stay sub-scale to protect the
no-spike turret mask.

r3 (shaded-parity r2): 90.5 → 90.6 (gun 85 → 87). D-30 compact brake enlarged to read:
drums 1.65x tube radius, wider slot w/ fattened dark core, dark rings on both faces of
both drums. Still >= 90 gate.

r4 verification (2026-07-31): no geometry changes this round. Re-verified 90.6 (H92 T87 G87
R92, minView 90.5) after the sovGear signature change — no regression.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 51.1 whole 33.8 turret 17.0 stations 54.9 dims 90.6 floaters 100
Dims vs published: heightM 2.50 (0.14%) hullL 6.88 overall 9.13 width 3.27 (+2.17%, -9.4 - fenders sit at the committed 3.20; the overshoot is grid quantization).
Oracle audit (v6 true cameras, width-normalized frame): print gun is LONG vs published: overall +9.0% (9.915 vs 9.10) while its hull is -5.3% short; height -5.4%.
Certified oracle-defect caps (component | ceiling | cause):
- turretCurves | ceiling ~17-35 | published 9.10 overall pins my D-30 muzzle at 4.01 where the print's reaches 4.97 - the missing 0.96 m of tube is charged as coverage+error on the turret rows (the tube lives in the turret mask); onion dome raised to the published 2.50 roof vs print 2.37
- wholeCurves | ceiling ~34-50 | same muzzle gap on whole rows + hull-length stretch vs the short print
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 51.1 whole 32.9 turret 5.2 stations 54.9 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.5/2.5 (0.14%) hullLengthM 6.88/6.9 (0.34%) overallLengthM 9.08/9.1 (0.17%) widthM 3.19/3.2 (0.31%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 2.346 vs pub 2.50 (-6.2%), bodyLen 6.449 vs 6.90 (-6.5%); whole span 9.90 vs oal 9.10 (+8.8% - the gun is proportionally LONG)
Cap verdict: NEW quantification — undersized hull + oversized gun cap the whole/turret rows in opposite directions
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.
