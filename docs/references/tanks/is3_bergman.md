# IS-3 (Bergman) — reference packet

Same real vehicle as the IS-3 (see docs/references/tanks/is3.md for the real
dimensions and sources: Wikipedia https://en.wikipedia.org/wiki/IS-3 — 9.725 m
overall, 3.07 m wide, 2.44 m high; Weaponsystems.net
https://www.weaponsystems.net/system/506-IS-3). Game spec row inherits
`is3.dims` (hull 6.77, overall 9.85, w 3.15, h 2.45).

## GLB oracle
`/models/tanks/community/recovered/bergman_is3.glb` (m_bergman print pack,
CC BY-NC-SA — LOCAL-ONLY QUARANTINE), articulated via `^Turret$` autoPivot.

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −3.47..+3.35 (len 6.82); roofline IDENTICAL to the
  panzerfactory IS-3 (rear 1.55-1.57, deck stowage line 1.72, crew roof 1.49,
  glacis 1.35→1.10).
- whole len only 6.96, top 2.19, gun overhang past the bow just 0.14 m at
  y 0.91-1.32 (fender-height bits that live in the Turret node).
- The rig is degenerate: the Turret node contains fender boxes/drums and the
  dome sits sunken so the upper (whole−hull) mask is a LOW small crown —
  front-view width only ~0.66 at y1.9, nothing above 2.19; side upper mask
  spans z −3.45..−1.7 down to y≈0 (rear drums) plus the small dome.

## Build notes / fidelity ceiling
Hull duplicates the IS-3 build (identical roofline). Turret must be a LOW
squat pancake dome (crown ≈2.19, no cupola/MG spikes) and the gun a stub that
barely clears the bow (~0.15 m) so the raw-frame overhang bbox matches.
The oracle's turret/gun masks are polluted by hull furniture parented into
its Turret node; matching them exactly would require parenting fenders/drums
to the procedural turret, which would spin hull furniture during articulation
— rejected. Turret and gun component scores therefore have a hard ceiling on
this row; hull/overall/tracks carry the total.

## Final fidelity (2026-07-30)
66.8 → 71.7 (H93 T20 G55 R86; overall 88.2, hull 93 — the real components).
Confirmed via turret-mask dumps: the oracle's Turret node is fenders/drums +
a sunken shell; its silhouette shows NO dome. Build matches the visible
truth (flush cap + hatch stack + stub muzzle with a tall thin collar blob).
T/G are hard-capped by the degenerate source rig; matching further would
require parenting hull furniture into the rotating turret — rejected for
articulation cleanliness.

## Shaded-parity r2 (2026-07-30) — IDENTITY REBUILD, score cost accepted
71.7 → 61.6 (H93 T21 G12 R87). The r1 flush-cap build matched this print's
degenerate rig but was rejected by the human shaded gate ("flat cone lid
flush on the deck"). r2 ships the REAL proud IS-3 dome + full D-25T with
double-baffle brake (shared construction with the is3 row, all r2 fittings
included) per the work order: identity beats the metric on a broken oracle.
Cost breakdown vs the degenerate GLB: T 20→21 (dome vs sunken shell — was
already floored), G 55→12 (real 2.25 m muzzle overhang vs the print's 0.14 m
stub), whole-silhouette views drop into the 60-70s. Hull/tracks (the only
meaningful components on this row) hold at H93/R87. The deck drums now carry
end caps + mounting straps (the r1 "loose floating cylinders" critique).
Reference GLB remains quarantined; do not trust automated numbers on this id.
