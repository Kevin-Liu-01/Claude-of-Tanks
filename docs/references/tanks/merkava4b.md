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
| 3 (shaded-parity r2: dark basket frame + chains, dark loader/coax MGs + smoke tubes, detail-tone cheeks, dished wheels, deck/glacis/tail furniture, skirt bolts + hems, front fender boards) | 78.7 | — | 82 | 51 | 86 | 86 | material/furniture pass — silhouette pinned |

Remaining gaps: oracle is 1.313x width-normalized (proportionally very tall);
its turret node also captured a front skirt section (MERKAVA_TURRET_FOLLOWERS
`ex_armor_(?!body)` in userdrops5.js), which the procedural turret cannot
mirror without swinging hull armor on turret yaw.
| 4 (r3 turret reconstruction: as merkava4 (shared modular rebuild — beak per the oracle low cheek tip y 1.93..2.23), paneled flanks (the r2-flagged missing kit), plateau/bustle/basket re-seated to the measured bands (basket -2.4..-3.9 top 2.56), rearTip bar DELETED (the r2 deck-skimming rail) — chains hang from the basket rim; smoke rosette on the cheek plane; hwMax 1.50 per plan ±1.5) | 79.3 | — | 82 | 53 | 86 | 86 | +0.6 total vs r2; clean-ref turret comp gains capped by the tall-oracle proportions |
| 5 (r5 FROM-SCRATCH curve rebuild: hull lofted from docs/references/profiles/merkava4b.json (deck 1.76, glacis (3.53,1.12)→(2.85,1.44)→(1.10,1.76), keel to (2.15,0.03), body ±1.66 with skirts ±1.835 over 2.48..−1.95, fender horns to 3.35); turret re-authored on the measured lines — beak tip (2.60, band 1.93..2.24) rising to the CREST (0.60,2.79), saddle 2.53 at 0.2..0.45, plateau 2.82 from −0.05 (r4 roofFront sat at −0.20), pano band to 3.08 with mast stubs, basket −2.36..−4.00 top 2.55, whips at −2.2/−2.5/−3.35; tail rack lowered to [1.42..1.94] (the 2.42 band erased our own basket — subtraction lesson), right-side frame kept to −4.24 | 79.5 | 85.3 | 83 | 55 | 84 | 86 | +0.2 over r4 79.3; T 53 → 55, H 82 → 83 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: beak + crest + saddle + wide plateau match the tall oracle's massing.
- side L/R: the crest-forward roof line (2.79@0.6 → 2.82 plateau) replaces the
  r4 flat roof that started 0.9 too far back; ref keeps its captured front
  skirt section in the turret node.
- rear: long basket band to −4.0 with the whip trio aligns; ref's rack band
  sits slightly higher than my lowered frame.
- quarters: same vehicle; my paneled flanks are flatter than the print's.
- top: near-identical (96.5).
- CURVE FINDINGS vs r4: the roof CRESTS at z 0.5–0.75 (2.79) with a saddle
  behind it — the plateau begins at −0.05, not −0.20; the basket runs to
  −4.02 (r4 stopped at −3.88); the hull's 2.42 rear band belongs to the
  oracle's hull but erases our own turret mask if copied at height.

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 24.6 / whole 17.5 / turret 0 / stations 63.8 / dims 93.7 /
floaters 100.
- hullCurves CAP: the print's turret casting is fused to its HULL node (hull
  mask tops 2.57-3.02 across z +2.0..-3.0) and mantlet fragments sit in the
  hull out to z 3.5. The deck pack reproduces part of the band; full parity
  would require a fixed (non-articulated) casting — program violation.
- turretCurves CAP: complementary defect — its rig_turret holds only sparse
  furniture (pano head, whips, basket sliver), so a complete turret can not
  match it. Needs an oracle re-rig (cf. 6fa0335).
- stations partial cap: the print is ~1.31x TALL (its plateau rides 2.80-3.14
  vs published 2.66); dims anchors the build at 2.66 so 4-5 mid slices carry
  a structural 7-9% roof-height delta (2 absorbed by the trimmed mean).
- wholeCurves gun cap: oracle MG253 muzzle +4.30 vs published-true +4.80.
