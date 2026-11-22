# Olifant TTD (`ttd`) — reference packet

## Current status (ttd-275, 2026-11-21): its own tank

Project Loggim's Tank Technology Demonstrator (one prototype, finished 1992; Reumech OMC the hull, Lyttelton Engineering
Works the turret and gun; at the SA Armour Museum since 1996-97): the South African special, ruled at tier IV (Main,
2026-11-02) and drawn at III by its same-tier duels (0.49 at III, 0.21 at IV: its 105 mm against the tier's 120 mm guns;
capability score 0.528).

Kevin, 2026-11-21: "make the ttd its own tank instead of being based off of the leopard 2". This replaces the 269 build,
which composed the fleet's Leopard 2 hull and 2A4 turret under the TTD's own kit (the owner's 2026-11-02 ruling "the ttd
needs to properly be based on an actual leopard 2"). The TTD is now drawn on its own construction from its photographs
and D. Bocquelet's side elevation:

- `src/vehicles/ttdArmor.ts`: the datums (hull, running gear, turret, gun) and the armour envelope on them.
- `src/vehicles/profiles/ttd.ts`: the build. It imports nothing of the Leopard 2 (the fixture checks this).
- `src/vehicles/southAfricaSpecs.ts`: the spec. Its data donor is the Olifant Mk 2 (the South African 105 mm), with the
  269 record kept unchanged: the TTD's mobility and gun figures, the gun's 32 deg/s elevation rate and the ground
  resistances the 269 spec carried, and every plate's protection carried by name onto the surface that now carries it.
- Internal layout: its own `ttd` row (TE's crew stations and ammunition stowage), no longer the `leopard` group.

Fixture `profiles/southAfrica.selftest.mjs`; photo packet `docs/references/photos/olifant-ttd-20261102.json`.

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/modern/south-africa/tank-technology-demonstrator/ (hull 7.78 x 3.62 x 2.99 m, 58.3 t; seven dual rubber-tyred road wheels on torsion bars, four return rollers, rear sprocket and front idler; the 51-calibre rifled 105 mm GT3 in its thermal shield, -10/+20; the sunken commander's cupola on the right with six periscopes; the CS60N and GS60 sights; two banks of four 81 mm behind an armour sheet; blow-off panels in the bustle; 6 + 16 + 32 rounds) |
| STT | D. Bocquelet's side elevation on TE (`STT.jpg`); a CC BY-SA tracing of it on Wikimedia Commons (`SADF Tank Technology Demonstrator.png`) agrees |
| SAAM | https://www.saarmourmuseum.com/tanktechnologydemonstrator (twin-turbo V-8 diesel 1,234 hp, 71 km/h, 4F/2R; the 105 mm GT3 for testing, the 120 mm GT6 for production; 750 mm effective glacis; the museum's own front three-quarter photograph) |
| W | https://en.wikipedia.org/wiki/Loggim_program |
| Photos | TE's parade (head-on, "TTD 001 M"), mobility (head-on, elevated), live-firing (front left) and museum-run (front left three-quarter) photographs |

The elevation is scaled on TE's 7.78 m hull: 77.8 px/m, ground at the track's foot. It then gives 9.40 m over the gun
(TE: 9.41 m) and 0.70 m road wheels at 0.83 m pitch, so the scale holds. Widths come from the head-on photographs
against TE's 3.62 m over the skirts (the turret 2.74 m across).

### Gap table (the 269 Leopard 2 build against the photographs)

Frame: hull metres, ground y 0, +Z forward, the hull's middle z 0.

| # | Photo read | Was (269, on the Leopard 2) | Now (ttd-275) |
|---|---|---|---|
| 1 | Hull 7.78 m long, deck 1.76 m at the turret face, 3.62 m over the skirts | Leopard 2 hull, 7.72 m, 3.67 m | own hull on TE's and STT's datums |
| 2 | Long shallow upper glacis (about 7 degrees) from the turret face (z 2.02, 1.76 m) to z 3.55, 1.56 m | Leopard 2 glacis | own deck line |
| 3 | Steep nose plate to the lip at z 3.90 (1.10 m), the lower glacis back under it; "TTD 001 M" on the plate, two tow lugs at its foot | Leopard 2 nose, stencil on its lower plate | own nose plate, stencil on it, lugs at x ±0.72 |
| 4 | Armoured corner boxes over the front fenders, proud of the nose plate, a louvre grille across each face | Leopard 2 lamp guards | own corner boxes, grilles, lamps |
| 5 | Tall flat skirts in four panels (joints z 1.70, -0.15, -2.00) from the fender ledge at 1.40 m to 0.77 m, the front panel's hem rising to the nose, a hinge foot at each joint | Leopard 2 skirts with fore blocks | own four-panel skirts |
| 6 | Upper side leaning in above the ledge; a louvred exhaust box on each side at the engine bay | Leopard 2 louvre deck | own side louvres |
| 7 | Engine deck raised 0.16 m on a ramp behind the bustle; the rear plate raked 17 degrees, its top overhanging | Leopard 2 flat deck, stern rack | own raised deck and raked stern |
| 8 | Seven dual road wheels, 0.70 m at 0.83 m pitch (z 2.58 to -2.40), raised front idler, rear sprocket, four return rollers behind the skirts | Leopard 2 gear | own gear |
| 9 | Long slab turret 2.74 m wide, face z 2.02 to bustle z -2.45, flat roof at 2.52 m, a broad chamfer along its front edge, the bustle's floor rising aft, the rear plate leaning back | 2A4 turret, square block front | own turret |
| 10 | Five upright blocks across the front: broad outer cheeks, narrower inner blocks with vent grids on their chamfer, the tall mantlet between them | 2A4 block cheeks either side of a slot | own five-block front |
| 11 | Tall mantlet set back in its slot, the gun low in it in a thick collar | 2A4 mantlet | own mantlet |
| 12 | GT3 L/51 in its thermal sleeve: thick root, fume extractor 0.86-1.55 m ahead of the face, slimmer fore sleeve, muzzle reference unit on top | 2A4's sleeved L/44 (10.06 m over the gun) | own GT3 tube (9.45 m over the gun) |
| 13 | GS60 gunner's sight box at the roof's right front, its broad rectangular window forward, a smaller box outboard | 2A4's sight recess | own GS60 box |
| 14 | Commander's sunken cupola right of centre behind the sight, six periscopes, the CS60N head (the roof's tallest point, 2.80 m) | 2A4 cupola | own cupola and CS60N |
| 15 | Loader's hatch left, two periscopes ahead of it, his FN MAG; the roof vent; the sensor mast behind the left inner block | 2A4 loader's station, MAG | own hatch, periscopes, mast; MAG kept |
| 16 | Two banks of four 81 mm dischargers on the roof's side edges a third back from the face, behind their sheets | TTD kit on the 2A4 roof | the same kit on its own roof |
| 17 | Big stowage boxes flush on the bustle's sides (the elevation's "T0" box), chamfered rear corners, a long tube on the roof aft | 2A4 side bins | own bins and tube |
| 18 | Driver's hatch just ahead of the turret face right of the gun, three episcopes in a raised block | Leopard 2 driver's station | own hatch and episcopes |
| 19 | Two whips at the bustle's rear corners | 2A4 whips | own whips |
| 20 | SANDF three-tone, number 01 | `paint_olifant_mk1b` recipe | kept |

### Spec changes

- Dims: hull 7.72 → 7.78 m, over the gun 10.06 → 9.41 m, width 3.67 → 3.62 m, height 2.64 → 2.80 m (the CS60N head;
  TE's 2.99 m is reached by no photographed part).
- Gun depression by yaw re-measured on the new hull (`tools/gun-depression-sweep.mjs`): -10 degrees over the front arc,
  about -9 over the corner boxes and side louvres, about -1.5 over the raised engine deck astern.
- Unchanged: the gun record (105 mm, the Mk 2's rounds, reload, accuracy, aim time), tier III, hp 2,200, 58.3 t, mobility,
  and every plate's protection value.
- The sim floor ledger (`docs/geometry-gate/sim-floors.json`) records the hull box's move: roof 1.80 → 1.92 m (the
  raised engine deck), bow 3.70 → 3.90 m, stern -3.80 → -3.89 m. The belly pan stays at 0.54 m.
