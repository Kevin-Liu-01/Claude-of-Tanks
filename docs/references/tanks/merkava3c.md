# Merkava Mk.3C (`merkava3c`) — reference packet

Exact variant: Merkava Mk.3 Baz/Kasag interim (Mk.3C) — Mk.3 hull + modular
turret, between 3B and 3D in fit: same plan as 3B with extra roof stowage and
the Kasag module lines; cupola right, bustle basket + chain curtain, deep
scalloped skirts; front engine, 6 wheels, FRONT sprocket, 120 mm MG251.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.army-guide.com/eng/product261.html ,
  https://www.globalsecurity.org/military/world/israel/merkava-3.htm
- Gun: MG251 120 mm L/44 (tube ≈ 5.3 m), thermal sleeve + evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_III ,
  https://www.primeportal.net/tanks/gil_moshe/merkava_3d_baz/

## Local GLB oracle (public/models/tanks/community/recovered/merkava3c.glb)
Width-normalized to 3.72. Whole z −4.14..+4.14; same sculpt family as 3B/3D:
- Hull: nose +3.33, tail −4.05; deck 1.63–1.72; skirt bottom ≈ 0.30; belly
  0.34; rear rack band to −4.05.
- Turret: roof plateau 2.38–2.45; cupola to 2.79; bustle 2.43 to −2.9; basket
  to −3.2; chains to −3.8; plan ±1.75 (3.50 m).
- Gun: axis y 1.96, tip +4.14, sleeved r ≈ 0.08.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 74.5 | — | 86 | 59 | 38 | 85 | baseline |
| 1 (bespoke rebuild) | 80.7 | — | 88 | 60 | 72 | 88 | |
| 2 (rotor/evac position + Kasag roof clutter kit) | 83.3 | 86.4 | 87 | 66 | 86 | 88 | best turret comp of the family |
| 3 (shaded-parity r2: Kasag clutter as strapped cloth bundles, gunmetal basket mesh/chains, detail-tone cheeks, dished wheels, deck/glacis/tail furniture, skirt bolts + hem, front fender boards) | 83.4 | — | 87 | 66 | 86 | 88 | material/furniture pass — silhouette pinned |

Remaining gaps: follower skirt capture in the ref turret mask (as 3D).
| 4 (r3 turret reconstruction: shared Mk.3 rebuild (see 3B row) + Kasag cloth clutter; cheek-vent louvres never re-added to the turret (r2 flagged them as belonging on the hull sponson) | 82.9 | — | 87 | 65 | 86 | 88 | best family turret comp holds |
