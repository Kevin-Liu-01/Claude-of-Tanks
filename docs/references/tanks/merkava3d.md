# Merkava Mk.3D (`merkava3d`) — reference packet

Exact variant: Merkava Mk.3D (Dor-Dalet) — Mk.3 hull with the larger modular
turret, wedge-shaped add-on side modules, raised commander cupola, rear bustle
basket + ball-and-chain curtain, deep scalloped side skirts; front engine,
6 road wheels, FRONT sprocket, 120 mm MG251.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m;
  ~65 t. Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.army-guide.com/eng/product261.html ,
  https://www.globalsecurity.org/military/world/israel/merkava-3.htm
- Gun: MG251 120 mm L/44, tube ≈ 5.3 m, thermal sleeve + evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_III ,
  https://www.primeportal.net/tanks/gil_moshe/merkava_3d_baz/

## Local GLB oracle (public/models/tanks/community/recovered/merkava3d.glb)
Width-normalized to 3.72. Whole z −4.14..+4.14:
- Hull: nose +3.35 (toe y ≈ 1.0), tail −4.05 (bottom rising to 0.86); deck
  y ≈ 1.63–1.72; upper glacis (3.3, 1.0) → (2.3, 1.55) → deck; lower glacis
  (3.3, 0.98) → (1.7, 0.03); skirt bottom ≈ 0.30–0.37 with wheel scallops;
  belly 0.34.
- Turret: front cheek from z ≈ 0.9 (top 2.34); roof plateau y 2.38–2.45 over
  z 0.05..−0.8; commander cupola 2.65–2.79 at z −0.5..−1.0; raised rear-roof
  stowage 2.54 to −1.85; bustle top ≈ 2.43 to −2.9; basket band 1.95..2.6 to
  −3.2; chains 1.9..2.15 at −3.4..−3.8; turret plan ≈ ±1.79 max (3.58 m).
- Gun: axis y 1.96, tip z +4.14, sleeved r ≈ 0.08; mantlet band 1.84..2.15
  at z ≈ 2.2.
- merkava3b / merkava3c oracles are the same sculpt family: nose 3.32–3.33,
  same tail/tip, turret ±1.75 (3.50 m); only detail fit differs.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 68.9 | 80.1 | 86 | 44 | 13 | 86 | baseline |
| 1 (bespoke rebuild) | 74.2 | — | 89 | 57 | 15 | 89 | gun blocked by rear-sliver asymmetry |
| 2 (rear chain-rail tip past the hull tail + width-norm fix) | 82.9 | 86.2 | 89 | 58 | 89 | 89 | gun metric fixed by mirroring the oracle's rear turret overhang |

Remaining gaps: ref turret mask carries rear+front skirt sections and the
hull rack (followers config), inflating the ref upper mask my clean turret
cannot fully cover.
