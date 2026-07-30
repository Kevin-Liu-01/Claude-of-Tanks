# Merkava Mk.3B (`merkava3b`) — reference packet

Exact variant: Merkava Mk.3 Baz (Mk.3B) — bigger hull than Mk.1/2, first
modular-armor turret (squarer, larger than the Mk.1/2 casting), commander
cupola right, bustle basket + ball-and-chain curtain, deep scalloped skirts;
front engine, 6 road wheels, FRONT sprocket, 120 mm MG251.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m;
  63.5–65 t. Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.army-guide.com/eng/product261.html ,
  https://www.globalsecurity.org/military/world/israel/merkava-3.htm
- Gun: MG251 120 mm L/44 (tube ≈ 5.3 m), thermal sleeve + evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_III ,
  https://www.primeportal.net/tanks/gil_moshe/merkava_3d_baz/

## Local GLB oracle (public/models/tanks/community/recovered/merkava3b.glb)
Width-normalized to 3.72. Whole z −4.14..+4.14; same sculpt family as the 3D
oracle with a slightly narrower turret:
- Hull: nose +3.32 (toe y ≈ 1.0), tail −4.05; deck 1.63–1.72; lower glacis to
  (1.7, 0.03); skirt bottom ≈ 0.30 with scallops; belly 0.34.
- Turret: front cheek from z ≈ 0.9; roof plateau 2.38–2.45 (z 0..−0.8);
  cupola 2.65–2.79; bustle 2.43 to −2.9; basket to −3.2; chains to −3.8;
  plan ±1.75 (3.50 m).
- Gun: axis y 1.96, tip +4.14, sleeved r ≈ 0.08.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 71.3 | — | 86 | 43 | 38 | 85 | baseline |
| 1 (bespoke rebuild) | 79.4 | — | 90 | 53 | 72 | 88 | |
| 2 (rotor/evac position, roof stowage kit, tail rack to -4.13) | 82.0 | 86.3 | 89 | 57 | 87 | 87 | |

Remaining gaps: follower skirt capture in the ref turret mask (as 3D).
