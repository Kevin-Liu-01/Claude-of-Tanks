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
| 3 (shaded-parity r2: dished exposed wheels dishR 0.78 with dark tire/annulus/bolts, gunmetal basket rails + mesh + chains, cloth bustle kit with straps, dark MG, deck grilles + headlight guards + tow eyes + tail hinge/latch detail) | 84.0 | — | 92 | 59 | 88 | 89 | material/furniture pass — silhouette pinned |

Remaining gaps: ref turret mask captured a mid-hull skirt trapezoid
(followers config); ref stowage silhouette atop the bustle is irregular.
| 4 (r3 turret reconstruction: compact cast wedge in ONE polyTurret + full-rake beak cheeks converging on the rotor (no mount box), open pipe-frame basket + coil + chains replacing the solid bin, soft cloth stowage mounds to the measured 2.5-2.8 band, busy roof (cupola dome + twin MGs + mortar lid + sight hood + mast), port-cheek smoke cluster, cast lifting lugs, antennas moved to the basket rear corners, clevis tow points, glacis-slope louvres) | 83.4 | — | 92 | 58 | 88 | 89 | turret comp 59->58: ref upper mask carries solid packed stowage; open-frame parity is its practical cap |

## r3 notes (turret reconstruction)
- Artifacts deleted: drawer-cabinet bustle stack, solid basket bin, roof-comb
  read (deck louvres moved onto the glacis slope), bow tow-eye torus ("cannon
  bore" ring -> clevis bracket), gunner-hatch jewelry ring, hull-mounted
  antenna read (masts now on basket corners).
- Beak lesson: cheek planes must run to the shell's TOP RING (ending at the
  base ring leaves a hidden trench + floating roof fittings).
| 5 (r5 FROM-SCRATCH curve rebuild: hull lofted from docs/references/profiles/merkava1b.json — near-full-width footprint to the nose (plan holds |x| 1.71–1.81 back to −3.93, prow ±0.95 @3.05, pod bulges to 3.18) replacing the r4 narrow-prow wedge; turret re-seated on the measured face z 1.60 (r4 used 0.86) with the roof rising (0.45,2.29)→(−1.0,2.40), rounded commander-station lathe dome to 2.80 over −0.55..−1.55, front brow mass 2.50 @0.9..1.55, long tapered M64 mantlet sleeve to z 2.45 (band top 2.10), basket to the measured −3.45 + trailing vane to −3.80, tail rack band [0.82..1.55] to −4.04 | 83.7 | 87.1 | 91 | 62 | 85 | 89 | +0.3 over r4 83.4; turret comp 58 → 62 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: wide blunt prow with pod bulges matches; ref scatters more small
  fittings across the glacis.
- side L/R: turret face at the measured 1.60 with the rising roof and dome now
  tracks the print; ref's mantlet casting is lumpier than my clean taper.
- rear: basket band, chains and the low tail rack line up; ref stowage
  silhouette is more irregular than my strapped cloth.
- quarters: read as the same vehicle; my bustle tarps are boxier than the
  ref's sagging kit.
- top: near-identical footprints (96.6) — full-width fenders were the fix.
- CURVE FINDINGS vs r4: the turret front face sits at z ≈ 1.6, not 0.86 (the
  2.5-band forward of the roof is real shell+brow, not fittings); the plan
  footprint stays near full width to the nose (r4's 0.3·hw prow cut the whole
  bow); basket content continues to −3.8 with a falling rim.

## Geometry-gate v6-v8 iteration (2026-07-31, geometry gate v8)

Full published-dims rebuild pass (gate v6 true-ortho cameras, v7
skirt-inclusive width band, v8 body-column registration). Family-wide
changes in `src/vehicles/profiles/merkava.js`: published-height clutter caps
(heightM is p95 of column tops — cupola/dome/pano/MG crowns authored at
publishedH-0.01; whip antennas carry the measured 4.8 m tops and stay inside
the p95 exclusion budget), WIDTH-GUARD outer faces at exactly half the
committed width, hull-length anchored at the measured toe/tail with body
wings, muzzle set from published overallLength (the print guns are modelled
short — the symmetric-coverage cost on wholeCurves is the certified gun cap),
turret ring-interior column matching the prints' turret-node interiors,
floater-proof chain-curtain hanger arms.

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 68.7 / whole 61.3 / turret 12.8 / stations 67.4 / dims 100 /
floaters 100.
- turretCurves CAP: the print's rig_gun sits at the GLB root, not under
  rig_turret — its gun/mantlet is absent from the reference turret mask while
  a correctly-rigged build's gun is present (plan cover ~10-15% + band
  errors). Also sparse follower sweep leaves chassis fittings in its turret
  mask (side bottoms 0.59 m across z -0.3..-1.9 matched via the ring column).
  Ceiling until an oracle re-rig (cf. merkava2b repair 6fa0335): observed ~30.
- wholeCurves gun cap: oracle M64 muzzle +4.09 vs published-true +4.42
  (overall 8.63); ~4 proc-only columns of coverage on side_whole.
  dims is fully satisfied (100) and is never excused by these caps.
