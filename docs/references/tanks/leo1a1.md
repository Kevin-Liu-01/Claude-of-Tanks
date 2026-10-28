# Leopard 1A1 (`leo1a1`): reference packet

## Owner ask (2026-10-28)

Verbatim: "keep ur new leopard variants and make one that uses the old hull and has like a rounder "unarmored" version
that looks more like the world of tanks leopard 1", then "yeah bc tghe old turret is still bad and the new turret for
leopard is better, but need it to look accurate".

So the 262 Leopard 1A5 stays as rebuilt, and this is a new vehicle:
- **Hull and running gear:** the Leopard 1A5's as they stood at `0a3d073341`, before the 262 proportion rebuild (deck
  crown 1.60–1.77 m, flat 1.75 m engine deck, 1.3175 m fender shelf, idler and sprocket lifted 50 mm, 540 mm track).
- **Turret:** a new, accurate bare cast turret of the first series, not the old ellipsoid. It is rounded, without the
  1A1A1's Blohm & Voss appliqué, and has the World of Tanks Leopard 1's look.

The id `leo1a1` follows the fleet's `leo1a5` and `leo2a*` spellings. It is drawn on the Leopard 1A5's node as a build at
tier I.

## Why the 1A1

The 1A1 (1974 onward) brought the L7A3's thermal sleeve and the rubber side skirts, both of which the old hull and gun
already carry. Its cast turret was still bare: from 1975 the 1A1A1 conversion added the bolted B&V plates. The 1A2
had a stronger casting of the same shape. A bare cast turret with skirts and a sleeved gun is therefore a 1A1.

## Sources

- Panzermuseum Munster, Leopard 1A2A1, bare cast turret:
  - Commons "Kampfpanzer Leopard 1 A2 A1.JPG": front three-quarter view.
  - Commons "Panzermuseum Munster 2010 0705.JPG" and "… 0706.JPG": front and front-left, Banznerfahrer, 7 July 2010,
    CC BY-SA 3.0.
  - Commons "Leopard 1 A2 A1 (27470540069).jpg": front-left view.
  - Together these give the casting's section, the bell mantlet, the rangefinder housings and the front-corner
    discharger blocks.
- The same museum's armoured 1A1A1 beside it: Commons "Deutsches Panzermusem Munster (48892254658).jpg". It shows what
  this vehicle does not carry, the angular B&V plates over the cheeks, sides and mantlet.
- Yad la-Shiryon's Leopard 1A1, side view (Commons "Leopard-1-latrun-2.jpg"): turret length and height against the hull.
  That vehicle wears B&V plates, so it was used for proportion only.
- Wikipedia (en/de), Leopard 1:
  - 2.39 m to the turret roof, 40 t for the 1A1.
  - The TEM 2A optical rangefinder, its two heads in armoured housings either side of the turret.
  - DM23, the first 105 mm APFSDS (1979).
- World of Tanks Tankopedia, "Leopard 1" (the owner's look reference): a low rounded cast turret with a pointed rounded
  nose, sides bulging low, the commander's raised cupola with its periscope on the right, the loader's hatch on the left
  and the basket around the tail.

## Turret: reference against build

| Feature | Reference | Build (`profiles/leopard1A1.ts`) |
|---|---|---|
| Casting section | Smooth egg: the foot tucked in, widest low, the side rolling over into a broad flat roof; no ridge | Ten-row egg (`CAST_EGG`), widest at a quarter height, roof flat over 38% of the half-width, smoothed normals on every side edge |
| Plan | Cheeks converge in a blunt rounded nose on the mantlet; long bustle with a blunt rounded tail | Twelve stations; ±1.19 m at the ring, 1.04 at z 0.76, a blunt nose at 1.18 and a blunt tail at −2.16 |
| Height | 0.81 m over the deck at the ring (2.39 m on a 1.58 m deck) | 0.81 m over the ring, so 2.52 m on the old hull's 1.71 m ring |
| Mantlet | Cast bell round the gun, as tall as the nose at its root, tapering to a collar | Gun-owned elliptical bell, 0.88 × 0.64 m at the root, 0.6 m deep; telescope port upper left, coaxial MG3 lower right |
| Rangefinder | TEM 2A heads in rounded armoured housings on both front cheeks, windows forward under hinged lids | Rounded blisters at z 0.60, windows and lids forward |
| Smoke | Wegmann 76 mm, a block of four on each front roof corner | Two-by-two blocks on brackets in the roof's rolled edge |
| Roof | Commander's cupola (eight periscopes) right with the TRP-2A ahead of it; loader's hatch and MG3 left; ventilator; two antenna bases | As listed |
| Bustle | Stowage basket round the tail, racks on the sides | Basket on a transom and brackets, racks at z −1.62 |
| Appliqué | None: the B&V plates are the 1A1A1's | None |

The casting's foot stands over the old hull's deck crown at every bearing, at 5 cm at the sides and 0.10–0.20 m under
the bustle. That deck rises from 1.69 m at the ring to 1.77 m 1.75 m behind it, and the ring bearing rises to meet the
foot. `leopard1A1Source.selftest.mjs` checks each turret vertex outside the bearing against the deck within its radius.

## Not drawn

- The PERI R12 commander's sight (1A1A1 and 1A2A1 retrofit): this is the 1A1 as built.
- The XSW-30-U searchlight. The 1A1 could carry it over the mantlet, but the owner's World of Tanks reference shows it
  without one, and the 1A5 carries it in this fleet.
