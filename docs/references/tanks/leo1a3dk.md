# Danish Leopard 1s (Leopard 1A3 DK, 1A5 DK, 1A5 DK-1): run packet

## Current status

- Updated: 2026-10-29. Lane item/denmark-line-265 (batch contract: docs/history/research/denmark-line-265.md).
- IDs: leo1a3dk (Leopard 1A3 DK, I, the Denmark tree's root), leo1a5dk (Leopard 1A5 DK, I), leo1a5dk1 (Leopard 1A5
  DK-1, I, twin build on leo1a5dk). Main's ruling 2026-10-29.
- Implementation: built (profiles/leopard1Dk.ts on profiles/leopard1Hull.ts), registered, regen rows written.
- Qualification: photo-class (docs/references/photos/leopard-1a3-dk-20261029.json, -1a5-dk-, -1a5-dk-1-); the fixture
  src/vehicles/profiles/denmark.selftest.mjs PASS; shaded blind photo critics and the distinctness critic against leo1a5
  owed (GPU).

## Scope and preservation

- New ids on the Leopard 1A5's hull: the hull stages moved unchanged from profiles/leopard.ts into
  profiles/leopard1Hull.ts (`buildLeo1HullSteps`, options `grouserRack` and `sideTools`); leo1a5 rebuilds byte-identical
  (104,432 vertices, geometry digest 7ef3caaef3d464d6 before and after).
- The turret is new: the welded 1A3 turret the Danish 1A5 DK kept (armyvehicles.dk: "Not to be confused with the German
  1 A5, the Danish version retains the welded turret").

| id | turret kit | hull kit | coat |
|---|---|---|---|
| leo1a3dk | TEM 2A rangefinder ports open, XSW-30-U searchlight, PERI R12 low | Danish dozer channels, periscope wipers, slope-fitted fender bins (no German grousers or side tools) | 1970s plain olive drab |
| leo1a5dk | EMES 18 box right front, PERI R12 raised, ports blanked (pale ring), roof rifle clips, rear rack, MRS | as above | 1990s three-tone |
| leo1a5dk1 | as 1A5 DK plus the air conditioning and Honda generator housing over the rear bin, the M41 DK-1's halogen searchlight | as above plus GPS | United Nations white |

## Sources

Pansermuseet Leopard 1 page (data plate, service history, Bøllebank tank 62.425); armyvehicles.dk leopard1a3.htm and
leopard1a5.htm; Wikimedia Commons: Krigsmuseet side view (turret stations by the 0.74 m road-wheel pitch: roof 0.87 m over
the base, front strip to 0.58 m, brow to z 0.91, body to z -1.655, bin to z -2.18, the 2x4 discharger block), the Aalborg
1A5 DK turret (pic1, pic2), the DK-1 with RAMTA plough (Vinding, CC BY-SA 3.0), 62.448 at the Danish Air Show 2022, Bosnia
1996.

## Handedness

A +Z hull's right is -X: the commander's cupola, PERI and EMES 18 sit at -X, the loader at +X, as the Aalborg turret
shows. (The German leo1a5 draws its EMES 18 and cupola at +X; reported to Main, who routed it to the Leopard 1 lane.)

## Combat data

Pansermuseet: 42.4 t, 830 hp, 65 km/h, 105 mm L7, four crew; the hull's armour and the L7A3 at the leo1a5's fleet
footing (the welded turret's protection is the cast turret's in the envelope); rounds DM23 (1A3 DK) and DM33 named on the
1A5's footing (no published Danish figure).
