# Engesa EE-T1 Osório (P.1 105 mm, P.2 120 mm): run packet

## Current status

- Updated: 2026-10-29. Lane item/brazil-line-266 (batch contract: docs/history/research/brazil-line-266.md).
- Owner request: "lets build brazil, not taiwan, and flesh it out with all its own tanks"; then "EE-T1 Osório. use our tank
  generation specs" (2026-10-29). Main's ruling the same day: osorio_p1 (EE-T1 Osório (105), III), osorio_p2 (EE-T1 Osório
  (120), IV), head A of the Brazil line.
- Implementation: built (profiles/osorio.ts, one build with marks p1/p2), registered (brazilSpecs.ts, profiles/brazil.ts,
  the Brazil tree).
- Qualification: photo-class (no registered 3D comparison exists); photo packets docs/references/photos/osorio-*-20261029.json;
  fixture src/vehicles/profiles/brazil.selftest.mjs. Shaded blind photo critic and the distinctness critic owed (GPU).
- Publication: none; next release per Main.

## Scope and preservation

New ids, a new primary build: no donor geometry. Combat data from the published figures; the armour at the AMX-40's
footing (its 1987 Saudi rival, the same GIAT G1 gun, the same "proof against 105 mm APFSDS" claim; Bastos: neither
prototype got its definitive armour). No existing id changes.

| id | configuration | gun | sights | kit | coat |
|---|---|---|---|---|---|
| osorio_p2 | the 120 mm P.2 (the 1987 Saudi "Al Fahd", the CIBld tank 2013-21, the 6º RCB's 2022 parades) | GIAT G1 smoothbore, segmented sleeve, no extractor | SFIM VS580-19 panoramic on its pedestal, VS580-10 gunner, Philips UA 9090 thermal head | 2x3 dischargers on each rear corner, a deep grid basket on the right wall from the cheeks to two-thirds back, the left wall bare but for its raised box, the bustle rack across the rear, laser-warning head and tall cylinders at the right rear | the Army two-tone: a muted earth brown and a very dark green in large hard-edged fields of about equal area, narrow olive bands (CIBld 2020) |
| osorio_p1 | the 105 mm P.1 of the Army's 1986-87 homologation (the Conde de Linhares museum tank, restored at Curitiba 2024) | Royal Ordnance L7A3 with fume extractor and sleeve | two low OIP LRS-5 heads | the commander's tall hooded sight behind the cupola, the black boot over the gun's root, a flat bar grid close on the right wall, 2x2 dischargers on the left wall two-thirds back and on the right behind the grid, the bustle rack, glacis travel lock | a reddish chocolate brown and a near-black green in broad hard-edged bands of about equal area, as photographed (2015, 2024) |

## Source and comparison contract

- No supplied model. Photographic and published-figure route (docs/tank-generation/README.md "Photographic qualification").
- Published dimensions (Engesa's data sheet in Forças Terrestres 2015; Jane's via M. Nita, Poligon 2014; Bastos 2003): hull
  7.13 m; 10.10 m (P.2) and 9.36 m (P.1) over the gun forward, 9.30 m and 8.56 m to the rear; 3.26 m over the skirts, 3.20 m
  without; 2.37 m to the turret roof, 2.89 m (P.2) and 2.68 m (P.1) to the sight; 0.46 m clearance; 570 mm Diehl tracks on
  2.63 m centres, 4.49 m on the ground; six dual road wheels and three return rollers a side, idler forward, sprocket aft,
  Dunlop hydropneumatic suspension.
- Derived: the ring 3.165 m behind the nose (both guns' forward and rearward lengths agree), the muzzle 6.135 m (P.2) and
  5.395 m (P.1) from the ring.
- Stations: Engesa's three-view (osorio-caracteristicasII.jpg in Forças Terrestres 2015) pixel-scanned and scaled on the
  7.13 m hull (59.2 px/m); the overall length checks at 10.08 m (published 10.10). Read off it: the nose tip at 1.12 m, the
  upper glacis 15 degrees to the deck at z 1.95, the deck 1.60 m, the rear plate vertical to 1.25 m then sloping to the
  belly; six wheel stations on a 0.895 m pitch; the skirt bottom 0.64 m; the turret 2.29 m wide (70 % of the hull), its
  cheek noses 1.44 m ahead of the ring and the bustle 2.38 m behind; the plan's cheek chamfer from 0.555 m half-width at the
  front to the 1.145 m slab sides 0.48 m back; the cheeks arrowheads in profile (the 1987, 2020 and 2022 photographs and the
  2024 P.1 profile; blind critics, round 2): the upper facet from the roof 0.87 m ahead of the ring to the nose point at
  0.46 m, the lower facet undercut back to the ring's front; the roof heads, cupola, hatch and MG stations; two circular fan grilles on
  the engine deck (artwork only, flagged in RESEARCH-osorio.md). The road wheels drawn small in the artwork: 0.73 m from the
  photographs, about 0.8 of the pitch (the P.1 profile, the Saudi 1987 and 2022 photographs; blind critics, round 1). The
  gun's trunnion 0.28 m over the ring plane (the P.1 profile photograph; the three-view's 0.25 m left the mantlet's
  underside on the deck short of the published -10 degrees).
- Photographs (viewed, cited, not downloaded): Wikimedia Commons "Osório (CIBld).png" (Jacupiri, CC BY-SA 4.0, P.2 2020),
  "Sem título 0053 (51959476017).jpg" and "13 05 2022 Solenidade ... (52070734282).jpg" (Vice-Presidência da República,
  CC BY 2.0, P.2 2022), "EE-T1 Osório.jpg" and "EE-T2 Osório.jpg" (public domain via Flickr, P.2 1987 and a parade);
  Tecnodefesa 2024 (P.1 left profile, Curitiba); Forças Terrestres 2015 (P.1 museum, P.2 rear, P.1 1985 side exhaust).
  Full list: ~/cot-lanes/brazil-line-266-evidence/RESEARCH-osorio.md §8.

## Handedness

A +Z hull's right is -X: the commander and gunner (and every sight head and the cupola) at -X, the loader's hatch, his
pintle M2HB and the driver at +X (Forças Terrestres; the photographs).

## Construction

Hull: a lower-hull loft (belly, lower nose plate, lip, glacis, rear slope), sponson lofts to the deck, the fender shelf,
seven skirt panels a side (the front one tapered), hinged front mudguards leaning to the idler hub. Turret: a six-point
slab loft (vertical sides, bevelled roof edge) with two chevron cheek lofts either side of the 0.90 m mantlet recess, the
roof wedge over the mantlet. Gun frame: the flat mantlet plate, its collar and canvas cover, the coaxial MG left and the
auxiliary sight right of the gun. Raster review (Node) rounds r1-r2: r1 had the turret's z stations in hull metres (the
turret 0.4 m forward and short); r2 put them in the turret frame.

## Combat data

Published: 43.7 t / 41.0 t, 1,040 hp MWM TBD 234, 70 km/h, 45 km/h reverse (Nita), more than 33 degrees a second of
traverse, +20/-10. The P.2 fires the French 120 mm rounds of its trials at the AMX-40's footing; the P.1 the L7's rounds at
the fleet's 105 mm footing. Fire control: the P.2's stabilised VS580 sights (accuracy 0.29, aim 1.75 s); the P.1's sights
mechanically linked (Forças Terrestres: poorer on the move: bloom x1.15).
