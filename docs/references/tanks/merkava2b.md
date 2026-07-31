# Merkava Mk.2B (`merkava2b`) — reference packet

Exact variant: Merkava Mk.2B — Mk.1-size hull with the small aft-set turret,
internal 60 mm mortar, thermal sights; ball-and-chain curtain behind the
bustle, big rear basket, improved (deeper) side skirts vs Mk.1; front engine,
6 wheels, FRONT sprocket, 105 mm M64 gun.

## Corroborated real dimensions
- Hull length 7.45 m; overall gun-forward 8.30–8.78 m (sources differ); width
  3.70 m; height 2.65 m; ~62 t.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/merkava-2-israel-uk ,
  http://www.army-guide.com/eng/product1392.html
- Gun: M64 105 mm rifled (L/52 → tube ≈ 5.5 m), bore evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_II ,
  https://www.primeportal.net/tanks/lior_bar/merkava_2/

## Local GLB oracle (public/models/tanks/community/recovered/merkava2b.glb)
Width-normalized to 3.70 (raw width slightly narrow: 3.63 before clamp).
Same sculpt family as 2D, centered ~+0.45 forward vs the 1B placement:
whole z −3.65..+4.55.
- Hull: nose +3.49, tail −3.6; deck 1.68–1.73; skirt bottom ≈ 0.3 with
  scallops; belly 0.45.
- Turret: front cheek z ≈ +1.3; roof plateau 2.40–2.46 (z 0.5..−0.6); cupola
  2.6–2.8; bustle 2.6 to −1.6; basket top 2.44 to −2.9; chains to −3.3.
- Gun: axis y ≈ 1.98, tip +4.55, r ≈ 0.075; mantlet band at z ≈ 1.9–2.4.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 71.6 | — | 82 | 25 | 80 | 86 | baseline |
| 1 (bespoke rebuild) | 72.3 | — | 81 | 26 | 71 | 91 | |
| 2 (small-turret mass fixes + gun radius/tip) | 74.8 | 87.6 | 81 | 26 | 90 | 92 | turret comp STUCK at 26 |
| 3 (shaded-parity r2: cloth bustle bags + straps, gunmetal basket rails/mesh/chains + hanger rail, dark MG + hatch seam rings, dished wheels, deck grilles, headlight guards, tow eyes, tail hinges, skirt bolts + rubber hem, front fender boards) | 74.9 | — | 81 | 26 | 89 | 92 | material/furniture pass — silhouette pinned |

ORACLE DEFECT (dominates this row): the 2B GLB's turret node captured the
ENTIRE side-skirt run (MERKAVA_TURRET_FOLLOWERS `ex_armor_(?!body)` matches
this sculpt's skirt nodes), so the reference turret mask includes both full
skirt bands in every component view and the reference hull mask LACKS them
(hull comp capped ~81, turret comp ~26 with a clean procedural split).
Whole-silhouette views are 87-96 and are what this pass optimizes. Fix
belongs in userdrops5.js (per-mark follower regex) — outside Merkava-family
file ownership.
| 4 (r3 turret reconstruction: ring re-seated — plateau front 0.88->0.52, casting ends at the measured -1.6 with the solid bustle box + basket bin DELETED; open rail basket + coil + chain curtain to ~-3.1; full-rake cast beak cheeks + small stepped rotor collar replace the square gun-mount box; busy roof kit; port-cheek smoke cluster; skirt hem 0.31->0.38 with scallop tabs so wheel arcs read; clevis tow points, glacis-slope louvres) | 75.1 | — | 81 | 27 | 89 | 92 | turret comp pinned ~27 by the oracle defect below |

## r3 notes (turret reconstruction + oracle-defect quantification)
- VERIFIED via GLB node audit: 26 `ex_armor_[lr]_NN` nodes (the full 13-panel
  skirt run per side, x ±1.9, full hull length) match MERKAVA_TURRET_FOLLOWERS
  `ex_armor_(?!body)` and ride the reference TURRET assembly. The ref upper
  mask therefore contains both full skirt bands in every component view —
  turret comp is structurally pinned at ~26-27 for ANY procedural turret.
  Pipeline fix (userdrops5.js, outside family ownership): per-mark follower
  regex for merkava2b/merkava2d excluding `ex_armor_[lr]_` (2b captures 26
  skirt nodes, 2d captures its 12 rear-half panels; 1b/4b capture none, which
  is why their comps read sane).
- Artifacts deleted: square gun-mount box, drawer-cabinet bustle, deck-comb
  read, bow torus ring, rearTip bar (chains now end at the measured -3.1).
- r2 critique items closed: ring forward + roof drop (plateau 0.5..-0.6 at
  2.40-2.46 exactly per oracle), skirt scallops with exposed wheels, bow
  periscope strip left as the only bow fitting (clevis is toe hardware).
