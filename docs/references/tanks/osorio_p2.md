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
| osorio_p2 | the 120 mm P.2 (the 1987 Saudi "Al Fahd", the CIBld tank 2013-21, the 6º RCB's 2022 parades) | GIAT G1 smoothbore, segmented sleeve, no extractor | SFIM VS580-19 panoramic on its pedestal, VS580-10 gunner, Philips UA 9090 thermal head | 2x3 dischargers on each rear corner, a deep grid basket on the right wall from the cheeks to two-thirds back, two tall boxes on the left wall behind the cheek, the bustle rack across the rear, laser-warning head and tall cylinders at the right rear, paired round lamps in housings, saw-tooth skirts | the Army two-tone: a mid chocolate brown and a very dark green, fields large enough to take a turret cheek, running near vertical (CIBld 2020) |
| osorio_p1 | the 105 mm P.1 of the Army's 1986-87 homologation (the Conde de Linhares museum tank, restored at Curitiba 2024) | Royal Ordnance L7A3 with fume extractor and sleeve | two low OIP LRS-5 heads | the commander's tall round-headed sight behind the cupola, the black boot over the gun's root and the extractor's thick section from it, a flat bar grid close on the right wall, nearly its full height, from a third of the way back to just ahead of the emblem, a near-full-height box on the left wall behind the cheek, 2x2 dischargers on the left wall at 60-76% of its length and on the right aft of the grid, the bustle rack, glacis travel lock, saw-tooth skirts, the lower-case engesa badge three-quarters back | a milk-chocolate brown with large rounded smooth-edged dark olive-grey blobs, a metre or more across, and its white ring-and-oval emblem at the right wall's rear (2015; the 2024 left-box emblem is not painted: one insignia a vehicle) |

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

## Round brazil-kit-274 (2026-11-20): EE-T3/T4 chevrons and the Brazilian crew kit

Owner, 2026-11-20: "for the eet3 osorio, osorio t4, make the front turret attachment things in front of cheeks chevrons
like the leopard 2a4 instead of those weird add ons because they look kind of goofy. also add more add ons attachments
and tank decorations on all brazilian tanks."

| # | Read | Was | Now |
|---|---|---|---|
| 1 | EE-T3/T4 cheek kit | thin wedge plates riding the cheeks' upper facets to a spike past the mantlet (T3 tip z 1.94, T4 2.24) | two chevron wedges (profiles/osorioChevron.ts) on the Leopard 2A4M's arrowhead: our plain leo2a4 keeps the square block (LEOPARD2A4_FAMILY_FRONT 'block'), the arrowhead is the 2A4M's 2A6-look front (leopard2A4Wedge.ts) |
| 2 | Wedge plan | wall's corner to an apex at the gun | the side armour's outer face carried forward from z 0.88, a 2 cm turn in, the swept face from the shoulder (T3 x 1.10 z 1.56, T4 1.16/1.68) to a blunt tip beside the mantlet (T3 0.515/1.98, T4 0.555/2.18) |
| 3 | Wedge top | one sloped plate | the lowest of the flat roof, a 32-degree front slope rising from the face's top edge (T3 0.40, T4 0.46) and a 58-degree outer bevel; floor rising 0.30 (T4 0.26) a metre past the turn; strips cut on the planes' meeting lines, every face planar |
| 4 | Side armour's front pack | face swept back to z 0.95 | square at z 0.87, 1 cm behind the wedge's root |
| 5 | Crew kit (all eight) | the tow shackles only (the tools row never seated) | 6-8 seated pieces per id through the decoration layer (decorations.ts BRAZIL_MANIFESTS): cables, spare links, tarps, nets, cans, crates, packs and tools on routed seats off the turret roofs |

Clearances: the wedges' inner faces stay at the recess's 0.475 m (the mantlet 0.86-0.90 m wide, the gun's sweep inside
it); the roots 2 cm ahead of the gunner's sight head and its visor. Hit zones follow the drawn wedges through the
combat-anatomy regeneration (the turret bucket's envelope and collision cells).

### P.1 and P.2 turrets (owner 2026-11-20 via Main: "unique turrets"; ruled "Keep record, bolder kit")

The record keeps one turret: Vickers designed and supplied both and they were interchangeable (Bastos, ARMOR, Forças
Terrestres 2015). The owner chose to keep the shared shell and make each mark's own kit read bolder; the EE-T3/T4 are
byte-identical to their approved build.

| # | Read | Was | Now |
|---|---|---|---|
| 6 | P.2 Philips thermal head | 0.12 m drum and dome | 0.15 m drum and dome with a hood over its window |
| 7 | P.2 laser-warning detector (Nita) | a 12 cm stub on the rear roof | a squat head with four quadrant windows on a 0.22 m post |
| 8 | P.2 right-wall basket | top rail 0.56 m, three loads | top rail 0.64 m, four loads heaped to the top rail |
| 9 | P.1 right-wall grid | 13 mm bars, 16 mm slats | 20 mm bars, 26 mm slats: a heavier flat grid against the P.2's deep basket |

Fender mirrors stay off the P.1: the photo review behind this build found none on either prototype (osorio.ts), though
the research table lists them.

### EE-T3/T4 mantlets (owner 2026-11-21: "make their mantelts different but also make both actually match up and align with the cheeks"; then "the eet3 mantlet is just flat and horizontal. fix both so theyre more like the leopard 2 mantlets in how they also match the top and bottom angle o the turrets/cheeks" and "it looks like the mantlets guns dont look properly attached")

| # | Read | Was | Now |
|---|---|---|---|
| 10 | Both mantlets' shape | the P.2's flat 0.86 m plate and canvas cover, 0.67 m behind the chevron tips | one block riding the gun that fills the slot between the chevrons wall to wall (13 mm running clearance a side), as the Leopard 2A5/2A6's mantlet wedge does between its turret wedges (osorio.ts buildEeMantlet). Its top is the chevrons' own top (osorioChevron.ts osorioChevronSurfaces) carried across the slot: their front slope rises from the face to the roof, each half on its side's plane, meeting in a low ridge over the gun. Its underside beside the gun is their floor, rising toward the tips. Its nose reaches their tips |
| 11 | EE-T3 mantlet | (as above) | a pointed wedge in plan, its faces parallel to the chevrons' faces (one arrowhead line nose to tips); the coaxial's port and the auxiliary sight's square to the faces; the gun leaves through an oval collar and seal ring past the point |
| 12 | EE-T4 mantlet | the plate with a 0.20 m bolted block on its face | a flat face square to the gun, flush with the tips, its top edge gabled on the two planes; bolted face plates either side of the gun, the coaxial's port under a hood; the gun leaves through a hooded collar and seal ring |
| 13 | Brow and cradle | the Vickers brow over the recess | the brow dropped on the EE pair (the mantlets' tops run up to the roof). The gun cradle's round housing about the trunnion axis (r 0.2395 m) stands out of the recess's front block just inside the mantlet's back face. It covers the gun line at every elevation and the mantlet, turning on the same axis, never meets it (gun-junction census CLOSED, 5 poses) |
| 14 | Under both | the old plate, collar and canvas cover | under the gun, a chin traces the old mount's round underside depth for depth, then closes round the tube. The gun-depression sweep holds both published curves: the EE-T3's within 0.07 degrees (yaw 38), the EE-T4's within 0.18 (yaw 103), inside the 0.35 tolerance. Nothing is blocked at full elevation |
| 15 | Gun height (owner 2026-11-21: "for both, just move the guns up a lil so the guns are centered in the mantelts") | the trunnion at 0.28 m, the gun along the mantlets' foot | the EE-T3's raised 12.5 cm and the EE-T4's 15.5 cm (osorio.ts EE_GUN_RISE), each to the middle of its mantlet's face. The mantlets stay on the chevrons, and the cradle follows the trunnion. brazilSpecs.ts gunPivot and the concept record's gunLocal follow. Re-measured depression is published: the full -10 to 140 degrees (EE-T3) and 120 (EE-T4), the drums astern cleared at +0.9 (nationalGunClearance PASS) |
