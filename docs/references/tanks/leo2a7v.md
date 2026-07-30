# Leopard 2A7V (`leo2a7v`)

**Exact variant modeled:** Leopard 2A7V, Bundeswehr, 2019+ fit — A7 wedge
turret with 120 mm L/55A1, added frontal hull armor module, deeper side
protection, APU/cooling housings on the rear hull, sensor masts.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m | Wikipedia Leopard 2, army-guide Leopard 2A7 |
| Overall length (gun forward) | 10.97 m | Wikipedia Leopard 2 (L/55 variants), armyrecognition 2A7 |
| Width (over armor modules) | ~4.0 m (3.75 base) | armyrecognition 2A7 (4.0 w/ appliqué), spec row |
| Height | 2.64 m roof / ~3.0 over sights | Wikipedia, steelbeasts SBWiki |
| Combat weight | 66.5 t | Wikipedia Leopard 2 (2A7V row), esut.de reporting |
| Gun | 120 mm Rh L/55A1, tube 6.60 m | Wikipedia Leopard 2, KNDS 2A7 materials |
| Running gear | 7 dual road wheels, rear sprocket | Wikipedia Leopard 2 |

## Identity cues

- A7V adds: frontal hull appliqué module (blunter, taller prow), thick modular
  side skirt courses the full hull length, enlarged rear-hull cooling/APU
  boxes, roof-mounted sensor/antenna masts, spare-track rack + rear baskets.
- Turret: A5/A6-family arrowhead wedges + EMES cutout + PERI stalk + crosswind
  mast + full-width bustle rack; tall mast farm at the bustle.
- Gun: L/55A1 — same 6.6 m tube identity as the A6.

## Reference links

1. https://en.wikipedia.org/wiki/Leopard_2 — variant table
2. https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/leopard-2a7-germany-uk — 2A7 data
3. https://www.kmweg.com / KNDS Leopard 2A7 product page — manufacturer imagery

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leo2a7v.glb` (desirefx print;
turret node `desirefx_me_003` = complete upper fighting compartment).
ORACLE PROPORTION NOTE: the print normalizes tall — deck at 2.6-2.9 on a 4.0
width (real deck/width ratio would give ~1.9); everything below matches the
print's own frame, giving deliberately chunky proportions. A mast farm
reaches y 5.5 (turret node) and a second mast lives in the HULL node at
z −2.1..−0.6 topping 3.16-3.24 (front-view hull mask tops 3.45).

Width-normalized probe (ground = 0 after +0.05 shift):

- hull z −5.92..+2.60 (8.52), plan full width ±2.0; deck 2.63-2.74 mid,
  2.74-2.92 rear shoulders (z −4.6..−3.5 rack/APU 2.72-2.92); glacis falls
  1.99@1.9 → 1.50@2.55 (blunt tall prow, hull nose 2.60); rear wall −5.92
  with lower ledge 0.9-1.4 at −5.7..−5.3.
- turret: band z −2.8..+2.6 walls; roof 2.99-3.10 rear-mid (z −2.1..−1.0),
  2.66-2.81 front; wedge falls 2.51@1.2 → 2.32@1.65 → gun; rear basket to
  z −4.6 at 2.58-2.73; masts: 5.55@z −3.93, 5.04@−3.71, 2.99@−3.48.
- turret width (front view upper): ±1.23 (narrower than hull's 4.0 spread).
- gun: axis y≈2.10, muzzle z 5.92 (3.3 m past the 2.60 nose), tube Ø≈0.22.
- tracks: bottom 0, wheels behind full-length deep skirts (side hull bottom
  edge 0-0.15 the whole run); idler ramp z 1.9→2.6 under the prow.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 73.3 | 76.7 | 77.7 | 53.2 | 61.8 | 87.5 | baseline (donor leo2a7 canonical + hull kit) |
