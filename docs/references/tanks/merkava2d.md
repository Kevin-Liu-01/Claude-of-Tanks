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
| 3 (shaded-parity r2: wedge-module recess seams, cloth bustle kit, gunmetal basket/chains/MG, dished wheels, deck/glacis/tail furniture, skirt bolts + hem, front fender boards) | 82.6 | — | 90 | 53 | 91 | 90 | material/furniture pass — silhouette pinned |

Remaining gaps: partial follower skirt capture in the ref turret mask
(smaller than 2B's but present: front sections + rows).
| 4 (r3 turret reconstruction: as 2B (shared small-turret rebuild) + cheek applique wedges rebuilt as proud overlays ON the beak planes — the detached standing-plate sliver and the floating apex box are DELETED; low 2D thermal sight box on the plateau; open basket + coil + chains; skirt scallops) | 82.3 | — | 91 | 52 | 91 | 90 | turret comp ~52 cap: 12 rear-half skirt panels ride the ref turret mask (see 2B note) |
| 5 (r5 FROM-SCRATCH curve rebuild: shared 2-series loft (see 2B r5) with the 2D deltas measured from docs/references/profiles/merkava2d.json — wedge-module cheek face at z 1.31 (2B: 1.15), roof (0.90,2.30)→(−1.35,2.42), basket to −3.00 + vane to −3.46, tail −3.55, tip 4.51 | 83.7 | 86.8 | 92 | 55 | 94 | 90 | +1.2 over r4 82.5; T 52 → 55 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: wedge cheeks + dome match; ref smoke/fitting clutter is finer grained.
- side L/R: face at 1.31 with the rising roof and mantlet-evac line tracks the
  print closely.
- rear: basket + chains + marker rods align; ref rear band slightly busier.
- quarters: same-vehicle read at every angle.
- top: near-identical (97.8).
- CURVE FINDINGS vs r4: same rising-roof/dome anatomy as 2B (r4 plateau was
  mis-seated); the wedge front face sits 0.16 further forward than 2B's.

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 61.1 / whole 47 / turret 0 / stations 71.8 / dims 95.4 /
floaters 100.
- turretCurves CAP: same unrepaired rig class as merkava1b (root-level gun
  absent from the reference turret mask; cheek-applique wedges ride the HULL
  node - front hull trace tops 2.34-2.48 at center). Observed ceiling ~0-15
  until an oracle re-rig; matching the wedge split would break articulation.
- hullCurves residue: the hull-node wedges (above) cost side/front hull rows
  a few points; reproduced partially with the hull deck pack.
