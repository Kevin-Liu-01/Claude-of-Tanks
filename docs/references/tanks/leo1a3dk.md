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
| leo1a3dk | TEM 2A rangefinder ports open, XSW-30-U searchlight, PERI R12 low | Danish dozer channels, periscope wipers, slope-fitted fender bins (no German grousers or side tools) | 1970s olive drab under black and earth field bands (plain until 2026-11-03: the owner's "any tank without a proper camo") |
| leo1a5dk | EMES 18 box right front, PERI R12 raised, ports blanked (pale ring), roof rifle clips, rear rack, MRS | as above | 1990s three-tone |
| leo1a5dk1 | as 1A5 DK plus the air conditioning and Honda generator housing over the rear bin, the M41 DK-1's halogen searchlight | as above plus GPS | United Nations white kept dominant, broken by pale-grey fields with bright and dark bars (`paint_leo1a5dk1`, 2026-11-03) |

## Sources

Pansermuseet Leopard 1 page (data plate, service history, Bøllebank tank 62.425); armyvehicles.dk leopard1a3.htm and
leopard1a5.htm; Wikimedia Commons: Krigsmuseet side view (turret stations by the 0.74 m road-wheel pitch; its roof read, 0.87 m over
the base (release 275: 0.79 m, below), front strip to 0.58 m, brow to z 0.91, body to z -1.655, bin to z -2.18, the 2x4 discharger block), the Aalborg
1A5 DK turret (pic1, pic2), the DK-1 with RAMTA plough (Vinding, CC BY-SA 3.0), 62.448 at the Danish Air Show 2022, Bosnia
1996.

## Handedness

A +Z hull's right is -X: the commander's cupola, PERI and EMES 18 sit at -X, the loader at +X, as the Aalborg turret
shows. (The German leo1a5 draws its EMES 18 and cupola at +X; reported to Main, who routed it to the Leopard 1 lane.)

## Combat data

Pansermuseet: 42.4 t, 830 hp, 65 km/h, 105 mm L7, four crew; the hull's armour and the L7A3 at the leo1a5's fleet
footing (the welded turret's protection is the cast turret's in the envelope); rounds DM23 (1A3 DK) and DM33 named on the
1A5's footing (no published Danish figure).

## Release 275: the Leopard 1 turret family (lane leo1-turrets-275)

Owner 2026-11-21: "make all leopard 1a... tanks' turrets be same height and properly shaped based on those turrets
because all the other countries leopard 1a... variants have weirdly tall turrets". Every Leopard 1 now reads its ring
station and roof height from one leaf, `src/vehicles/profiles/leopard1Turret.ts` (`LEO1_TURRET`: ring 0.50 m ahead of the
hull origin at 1.60 m, roof 0.79 m over it at the published 2.39 m), and `leopard1Turret.selftest.mjs` builds every
Leopard 1 in the fleet and holds it there.

| # | Read | Was | Now |
|---|---|---|---|
| 1 | Turret roof: 2.39 m (Wikipedia, Leopard 1); the Munster 1A4 placard (welded "Turm in Schottbauweise") 2.62 m overall, the cast 1A1's 2.61 m: the welded roof level with the cast one | 2.47 m (Krigsmuseet read: 0.87 m over the ring) | 2.39 m, 0.79 m over the ring, the 1A5's figure |
| 2 | Port Kennedy AS1 side photograph (Commons, Calistemon, CC BY-SA 4.0) by its road-wheel pitch: roof 0.79 m over the turret base; gun axis about 1.90 m; mantlet front 1.48 m and roof front 0.99 m ahead of the ring; rear plate 2.25 m behind | — | roof as row 1; gun axis kept at 1.92 m (trunnion 0.32 m, within the read); plan stations kept (within 5-8 cm) |
| 3 | The side kit up the plate (weld seams, grab rails, Wegmann brackets and guards, the hull number, the DK-1's UN) | at the 0.87 m roof's heights; the A3's guard loop at 0.80 m stood over the new roof | each scaled by 0.79/0.87 (`W.railY`, `seamY`, `dischargerY`, `tubeRowY`, `guardY`, `stencilY`) |
| 4 | Shoulder, brow foot, bin floor, rangefinder ports | 0.42 / 0.58 / 0.22 / 0.36 m | 0.38 / 0.53 / 0.20 / 0.33 m |
| 5 | Leopard 1A2A1 on its 10-28 old hull (deck 1.69 m at the ring) | roof 2.50 m | unchanged: the owner kept the old hull ("Keep the old hull", 2026-11-21); the receipt names it as the one exception |

Ids moved: leo1a3dk, leo1a5dk, leo1a5dk1, leopard_as1 (turret roof down 0.08 m; whips 4.51 -> 4.43 m). leo1a5 and
leo1a2a1 build byte-identically (they read the same 0.79 m and 0.50 m from the leaf). leopard2_proto reads none of these
files. No Brazilian, Canadian or other national Leopard 1 id exists in the fleet.
