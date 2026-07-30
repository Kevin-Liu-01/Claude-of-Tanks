# Merkava Mk.2D (`merkava2d`) — reference packet

Exact variant: Merkava Mk.2D (Dor-Dalet) — the last Mk.2 fit: FIRST WEDGE
composite modules on the small turret's front cheeks (visually bulkier turret
front than 2B), deeper skirts, rear basket + ball-and-chain curtain; front
engine, 6 wheels, FRONT sprocket, 105 mm M64 gun.

## Corroborated real dimensions
- Hull length 7.45 m; overall gun-forward 8.30–8.78 m; width 3.70 m; height
  2.65 m; ~63 t. Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/merkava-2-israel-uk ,
  http://www.army-guide.com/eng/product1392.html
- Gun: M64 105 mm rifled (L/52 → tube ≈ 5.5 m), bore evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_II ,
  https://www.primeportal.net/tanks/lior_bar/merkava_2/

## Local GLB oracle (public/models/tanks/community/recovered/merkava2d.glb)
Width-normalized to 3.70. Same sculpt family as 2B (centered, nose +3.49):
whole z −3.62..+4.51.
- Hull: nose +3.49 (toe y ≈ 1.0), tail −3.55; deck 1.68–1.73; upper glacis
  (3.43, 1.11) → (1.3, 1.73); lower glacis (3.43, 0.95) → (2.1, 0.02); skirt
  bottom ≈ 0.29–0.35 with wheel scallops; belly 0.45; rear slope to
  (−3.5, 1.44).
- Turret: front cheek z ≈ +1.3 (wedge modules); roof plateau 2.40–2.46 over
  z 0.5..−0.6; cupola 2.6–2.8; bustle 2.6 to −1.6; basket top 2.44 to −2.9;
  chains to −3.3; front-view flat top ≈ ±0.85, shoulders to ±1.25.
- Gun: axis y 1.98, tip +4.51, r ≈ 0.075; mantlet band 1.86..2.11 at
  z 1.9–2.4.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 76.6 | — | 88 | 40 | 84 | 86 | baseline |
| 1 (bespoke rebuild + wedge cheek kit) | 79.0 | — | 91 | 47 | 74 | 90 | |
| 2 (bustle fill, rotor length, roof raise) | 82.2 | 86.3 | 90 | 53 | 89 | 89 | |

Remaining gaps: partial follower skirt capture in the ref turret mask
(smaller than 2B's but present: front sections + rows).
