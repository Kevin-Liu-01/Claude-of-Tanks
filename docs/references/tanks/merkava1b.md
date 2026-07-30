# Merkava Mk.1B (`merkava1b`) — reference packet

Exact variant: Merkava Mk.1B (post-1982 refit of the Mk.1) — small compact
cast/welded turret set well aft with the sloped roof rising to the rear, big
rear turret basket, ball-and-chain curtain added at refit (like Mk.2), narrow
fender-line skirts with exposed road wheels, front engine, 6 wheels, FRONT
sprocket, 105 mm M64 (licensed M68) rifled gun, external stowage everywhere.

## Corroborated real dimensions
- Hull length 7.45 m; overall gun-forward 8.30–8.65 m (sources differ); width
  3.70 m; height 2.65 m to turret roof; ~61 t.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.globalsecurity.org/military/world/israel/merkava-1.htm ,
  https://www.army-guide.com/eng/product2050.html
- Gun: M64 105 mm rifled (M68/L7 family, L/52 → tube ≈ 5.5 m), bore evacuator,
  no thermal sleeve on the Mk.1B fit; large cast external mantlet.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_I ,
  https://www.primeportal.net/tanks/lior_bar/merkava_1/

## Local GLB oracle (public/models/tanks/community/recovered/merkava1b.glb)
Width-normalized to 3.70. NOTE: this oracle sits ~0.44 m REARWARD in its own
frame vs the 2B/2D sculpts (raw z placement matters only for the gun-overhang
metric): whole z −3.94..+4.06.
- Hull: nose +3.05 (toe y ≈ 1.0), tail −3.94; deck y ≈ 1.68–1.73; upper
  glacis (3.02, 1.10) → (0.9, 1.72); lower glacis (3.02, 0.95) → (1.9, 0.09);
  wheels EXPOSED (thin fender line at y ≈ 1.2 only); belly 0.44; rear plate
  slope to (−3.94, 0.93..1.44).
- Turret (small!): front cheek tip z +0.86 at y 1.80..2.20; roof RISES
  rearward (0.4, 2.28) → (−1.0, 2.40); cupola bumps 2.57–2.84 at −0.7..−1.1;
  bustle stowage 2.5–2.8 to −2.4; BASKET z −2.5..−3.4 top 2.44; chains below
  basket to −3.68; front-view flat top ≈ ±0.85, shoulders to ±1.2.
- Gun: axis y 1.98, tip +4.06, bare tube r ≈ 0.075; mantlet band 1.86..2.11
  over z 0.9..1.9.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 71.1 | — | 88 | 38 | 45 | 85 | baseline |
| 1 (bespoke rebuild: exposed gear + fender line + small turret) | 79.8 | — | 91 | 53 | 70 | 89 | |
| 2 (bustle fills to measured top, longer rotor, wider cheeks) | 83.9 | 86.6 | 92 | 59 | 88 | 89 | family best |

Remaining gaps: ref turret mask captured a mid-hull skirt trapezoid
(followers config); ref stowage silhouette atop the bustle is irregular.
