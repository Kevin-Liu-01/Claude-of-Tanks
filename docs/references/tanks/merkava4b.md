# Merkava Mk.4B (`merkava4b`) — reference packet

Exact variant: Merkava Mk.4 early/B fit WITHOUT Trophy APS — same flat-roofed
wedge turret, angled gun-mount cheek, no loader's hatch, rear basket + chain
curtain, roof MG at the commander's station, twin smoke clusters; front
engine, 6 road wheels, FRONT sprocket, deep skirts with scalloped lower edge.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m
  to turret roof; ~65 t.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  http://www.army-guide.com/eng/product1602.html ,
  https://www.army-technology.com/projects/merkava4/
- Gun: MG253 120 mm L/44, tube ≈ 5.3 m, thermal sleeve + evacuator, overhang
  past the nose ≈ 1.3 m.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_IV ,
  https://www.primeportal.net/tanks/dmitry_derevyankin/merkava_4m/

## Local GLB oracle (public/models/tanks/community/recovered/merkava4b.glb)
Width-normalized ×1.313 (artist modeled narrow → oracle is proportionally
TALL: h/w ≈ 0.83 vs 0.72 real). Scoring targets ARE these oracle numbers:
- Whole z −4.29..+4.29; hull nose +3.50 (toe y ≈ 1.0), tail −4.20.
- Deck y ≈ 1.74–1.79; upper glacis (3.44, 1.2) → (1.1, 1.79); lower glacis
  (3.5, 1.0) → (2.0, 0.05); skirt bottom 0.43–0.48 with 6 wheel scallops;
  belly ≈ 0.5; rear slope (−3.6, 1.7) → (−4.16, 1.35); rear rack/basket band
  y 1.95–2.6 from z −2.4 back to −3.9.
- Turret: mantlet/cheek tip reaches z ≈ 2.4–2.6 at y 1.93..2.23; roof plateau
  y 2.82 over z −0.2..−1.35 (pano head 2.96–3.08); rear roof 2.73 to −1.9;
  basket top ≈ 2.5–2.6 to z −3.9, chains below; turret plan ≈ ±1.5, hull plan
  ±1.84–1.86.
- Gun: axis y 2.06, tip z +4.29, sleeved r ≈ 0.08. Ref hull mask carries a
  small fragment out to z ≈ 3.75, so the scored ref gun sliver is roughly
  z 3.79..4.29 at y ≈ 2.0.
- Tall whip antennas (to y 4.54) sit in the turret mask; thin, low IoU cost.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (base:'merkava4' donor + kit) | 67.0 | 72.9 | 82 | 29 | 51 | 88 | baseline |
| 1 (bespoke rebuild via shared buildMerkavaMark) | 77.5 | — | 84 | 39 | 69 | 87 | no more base:'merkava4' donor |
| 2 (LOD0 buckets + rotor + gun radius/tip + rear extents) | 78.7 | 85.1 | 82 | 51 | 86 | 86 | turret comp capped by follower skirt capture + tall-oracle proportions |

Remaining gaps: oracle is 1.313x width-normalized (proportionally very tall);
its turret node also captured a front skirt section (MERKAVA_TURRET_FOLLOWERS
`ex_armor_(?!body)` in userdrops5.js), which the procedural turret cannot
mirror without swinging hull armor on turret yaw.
