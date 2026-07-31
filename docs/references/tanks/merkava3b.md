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
| 3 (shaded-parity r2: strapped cloth roof bundles, gunmetal basket mesh/chains, detail-tone gun-mount cheeks + rotor recess rings, dished wheels, deck grilles/headlight guards/tow eyes/tail hinges, skirt bolts + hem, front fender boards) | 82.0 | — | 89 | 57 | 87 | 87 | material/furniture pass — silhouette pinned |

Remaining gaps: follower skirt capture in the ref turret mask (as 3D).
| 4 (r3 turret reconstruction: ONE continuous raked cheek plane per side from the gun notch to the roof shoulders (mount-box + detail-cheek slabs deleted), plateau re-seated to the measured z 0..-0.8, bustle walls flush with the shell (no parapet step), SHORT open basket -2.9..-3.2 + low chain band, twin pintle MGs + port-cheek smoke cluster on the beak plane, cloth roof bundles, skirt hem + scallop tabs) | 81.4 | — | 89 | 55 | 87 | 87 | ref upper mask still carries captured rear sponson strips (8 ex_armor_[lr] nodes) |
| 5 (r5 FROM-SCRATCH curve rebuild: hull lofted from docs/references/profiles/merkava3b.json (steep glacis (3.33,1.0)→(2.55,1.58), front-deck shelf 1.70, keel to (2.0,0.0), full-width plan ±1.75 with skirt bulge ±1.845 over −3.4..2.6); turret re-seated on the measured face z 1.75 (r4 used 0.92!) with the proud gun-mount CREST 2.55 over 0.42..1.50, roof 2.40, wide roof ring (roofHW 1.32 per the ±1.3–1.4 front band), cupola/pano band to 2.86, bustle 2.40 to −2.72, basket to −3.22; gun axis raised to the measured 1.97 with the evac bulge at z 2.4–2.6 (G 87 → 95); tall rear rack rebuilt as a low full-width band [1.42..1.94] + front fender boards at y 1.06 | 82.3 | 85.2 | 88 | 57 | 95 | 88 | +1.0 over r4 81.3 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: cheek planes, crest and wide roof ring match; ref hangs more clutter
  off the roof edges.
- side L/R: face at 1.75 + crest + saddle + cupola band track the print; ref
  still carries captured skirt strips in its turret node that no clean split
  mirrors.
- rear: bustle width and basket rim align; ref's rack band reads slightly
  taller at the corners.
- quarters: same vehicle; my Kasag-less roof is cleaner than the print's.
- top: near-identical (97.0).
- CURVE FINDINGS vs r4: the modular turret face is 0.8 m forward of the r4
  seat (z 1.75 vs 0.92) with a PROUD rotor-housing crest above the roof line;
  the gun axis is 1.97 (1.95 cost 4 G points — the sliver metric is 1 cm
  sensitive); the evacuator sits at z 2.4–2.6, outside the mantlet; hull
  furniture above the basket floor erases our own turret mask (rack capped at
  1.94).

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 54.6 / whole 39.9 / turret 1.5 / stations 81 / dims 96.8 /
floaters 100.
- turretCurves CAP: print rig_gun at GLB root (gun absent from its turret
  mask) + follower sweep leaves skirt panels/chassis bits in its turret mask
  (side bottoms 0.55-0.66 across the casting span). Ring column matches the
  interior; the gun asymmetry needs an oracle re-rig (cf. 6fa0335).
- wholeCurves gun cap: oracle MG251 muzzle +4.14 vs published-true +4.73
  (L/48 at overall 9.04) — ~6 columns of symmetric coverage on side_whole.
- Measured findings this pass: tall rear stowage is a NARROW center stack
  (front hull tops 2.2-2.47 only inside |x|<0.8) over a low full-width frame;
  skirts ride 0.62-1.36; whips both at x ~ +1.0, tops 4.83-4.86.
