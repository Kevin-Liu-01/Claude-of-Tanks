# Leopard 2A6 (`leo2a6`)

**Exact variant modeled:** Leopard 2A6, Bundeswehr, 2001+ fit — 2A5 arrowhead
wedge turret + Rheinmetall 120 mm L/55, PERI R17A2, EMES 15, bustle rack,
heavy sculpted front skirt modules, 2×4 Wegmann 76 mm smoke mortars per side.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m | army-guide.com/eng/product1461, Wikipedia Leopard 2 |
| Overall length (gun forward) | 10.97 m | Wikipedia Leopard 2 (2A6 row), inetres.com Leopard 2 |
| Width (over skirts) | 3.75 m (3.74 armyrecognition) | Wikipedia, armyrecognition.com 2A6 |
| Height (turret roof / over PERI) | 2.64 m / ~3.0 m | Wikipedia (3.0 over sights), steelbeasts SBWiki |
| Gun | 120 mm Rh L/55, tube 55×0.12 = 6.60 m | Wikipedia Leopard 2, agoramodels 2A6 |
| Running gear | 7 dual rubber road wheels, 4 return rollers, rear drive sprocket, front idler | Wikipedia Leopard 2 |

## Identity cues

- Turret: flat vertical-sided welded box behind the TWO spaced arrowhead wedge
  shells (A5+); EMES 15 in a recessed cutout on the right wedge roof edge,
  PERI R17A2 stalk center-right behind the commander hatch, crosswind mast at
  the rear roof, full-width slatted bustle stowage rack, tall whip antennas.
- Mantlet: narrow vertical plate mantlet in the arrow notch (not a cast saddle).
- Gun: L/55 — the longest tube of the family bar KF51; two thermal-sleeve
  segments with dark clamp rings, bore evacuator in the sleeve gap, MRS collar.
- Hull: high prow, short near-horizontal 81° upper glacis meeting the deck at
  a crease; driver hatch front-right with 3 periscopes; two circular cooling
  fans + longitudinal radiator grilles on the rear deck; vertical rear plate.
- Running gear: heavy sculpted front skirt blocks (fender-deep) over the first
  ~3 stations, thinner rubber-lipped rear skirt; 7 wheels with dark tire rims.

## Reference links

1. https://www.primeportal.net/tanks/de_craecker/leo2_demo_walk.htm — Leopard 2 walkaround (Prime Portal)
2. https://en.wikipedia.org/wiki/Leopard_2 — dims table, CC BY-SA
3. https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/leopard-2a6-germany-uk — 2A6 data
4. http://www.army-guide.com/eng/product1461.html — 2A6 hull length

## Local GLB oracle notes

Path: `public/models/tanks/leo2a6_buh.glb` ("Leopard 2 A6" by buh, CC-BY 4.0).
Proud articulated turret + real L/55. Width-normalized probe (ground +0.08 in
probe frame; numbers below shifted to ground = 0):

- hull z −3.75..+3.76 (7.51 — prints ~3% short of the real 7.72), full-width
  plan ±1.875 nearly nose to tail; front deck 1.78-1.81, engine deck 1.92-1.96
  (rear high), glacis crease z≈1.95 falling 1.74→1.48 at z 3.44, beak to 3.76.
- turret: walls z −2.2..+2.35, wedge apex reaching z≈2.6-2.9 ahead of the
  ring; roof band 2.50-2.60; PERI blister 2.93 at z≈−0.5; EMES hump ~2.75 at
  z≈−0.2; bustle basket overhang to z≈−2.72; whip antenna to ~4.2 at z≈−2.0.
- turret width (front view upper): x −1.45..+1.39 → wedge tips ±1.42.
- gun: axis y≈2.02, muzzle z 8.27 (4.5 m past the bow), sleeved tube Ø≈0.25,
  root/mantlet band Ø≈0.36 at z 3.2-3.9.
- tracks: bottom 0, idler ramp z 3.0→3.65 (front idler ~z 3.3), sprocket ramp
  z −3.5→−2.9 (rear drive ~z −3.2).

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.0 | 70.0 | 73.3 | 64.4 | 58.5 | 70.4 | baseline (generic LEOPARD template profile) |
| 2026-07-30 | 84.1 | 83.1 | 88.7 | 75.1 | 81.4 | 86.8 | r1: bespoke oracle-frame build — deck polyline hull, wedge turret + EMES/PERI/rack, L/55 sleeve+evac+MRS, heavy front skirts |
| 2026-07-30 | 85.6 | 83.9 | 90.0 | 77.0 | 83.8 | 86.8 | r2: deck −0.1 (projection-bias fix), idler/sprocket raised to the ref ramps, smoke banks pulled inside wedge width, taller antennas |
| 2026-07-30 | 86.0 | ~84 | 90.0 | 79.0 | 84.0 | 87.0 | r3: wedge apex extended to the oracle's z 3.3 reach with 180°-yaw deck clearance, deep mantlet block in the arrow notch |

Shaded-parity notes (fresh board, boards/leo2a6.png): sealed plate mantlet on a
trunnion roll — no void at −9/+20; materials split (dark grilles/fan discs/
seams, rubber skirt lip + flaps + anti-slip, glass EMES/PERI/headlights, cloth
bustle duffels); 7 rubber-rimmed wheels w/ dark hub contrast behind skirts;
zero floaters through the 24-frame turntable.

## GATE-V9 CERTIFIED ORACLE-DEFECT CAP — wholeCurves (long-modelled gun, 2026-07-31)

The buh print's L/55 muzzle reads z +8.28 after width normalization —
oracle overall 11.99 m vs the published 10.97 m (+9.3 %) on a hull that
prints 7.36-7.50 m (−3..−5 % of 7.72). The gun is modelled ~1.0 m too long
relative to the published envelope. The build carries the PUBLISHED gun
(muzzle at tail +10.97): because v9 registration is hull-anchored, the
delta lands ONLY in the gun-bearing whole rows as ~8 reference-only barrel
columns — side_whole/plan_whole cover ≈ 5-9 % → **wholeCurves ceiling
≈ 82-86** against this oracle. hullCurves, turretCurves (v9 hull-footprint
trim drops barrels), stations, dims and floaters are NOT capped. Repair
queue: rigid scale/translate of the gun submesh to the published overhang
would retire this cap (same class as the m26_pershing short-barrel entry).
