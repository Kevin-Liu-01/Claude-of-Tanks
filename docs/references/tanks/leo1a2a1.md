# Leopard 1A2A1 (`leo1a2a1`) — reference packet

## Owner asks (2026-10-28)

The owner's requests, verbatim and in order:
- "keep ur new leopard variants and make one that uses the old hull and has like a rounder "unarmored" version that
  looks more like the world of tanks leopard 1"
- "the old turret is still bad and the new turret for leopard is better, but need it to look accurate"
- After the first build: "completely redesign this current leopard. nit needs to take a lot more innspo from thhat 1a2,
  from teh chevron mentlet thhat joins at a line, the turret thhat is a lot better annd not just a ttorus, the boxes, smoke
  canisters, tech etc"
- After the 1A2 redesign: "no its bad make it based off the 1a5 more with a slightly rounded corners and the correct
  mantlet (which the 1a5 should also have this kind of mantlet that ends in a line) then show me"

The 262 Leopard 1A5 is unchanged. This is a separate vehicle:
- **Hull and running gear:** the Leopard 1A5's as they stood at `0a3d073341`, before the 262 proportion rebuild. That
  gives:
  - a deck crown of 1.60–1.77 m with a flat 1.75 m engine deck;
  - a 1.3175 m fender shelf;
  - the idler and sprocket lifted 50 mm;
  - 540 mm track.
- **Turret:** the Panzermuseum Munster's Leopard 1A2A1, as the owner pointed to it, modelled feature by feature.

The first build was a rounded egg-section casting with a bell mantlet, published as `leo1a1`. It was redesigned and
renamed before it reached main: the PERI R12 makes the vehicle an A2A1. The id follows the fleet's `leo1a5` and `leo2a*`
spellings. It is drawn on the Leopard 1A5's node as a build at tier I.

## Sources

| Source | Credit | What it gives |
|---|---|---|
| Commons "Kampfpanzer Leopard 1 A2 A1.JPG" (3008×2000) | Huhu (de.wikipedia), 29 Aug 2008, public domain | The front at full resolution: the chevron front, the mantlet block, the rangefinder boss, the PERI R12 on its pedestal |
| Commons "Panzermuseum Munster 2010 0705.JPG" and "… 0706.JPG" (4272×2848) | Banznerfahrer, 7 Jul 2010, CC BY-SA 3.0 | The front-left: the chine running round the cheek and down the side, the rangefinder drum, the discharger cluster on its bracket, the beacon post and the loader's MG3 |
| Commons "Leopard 1 A2 A1 (27470540069).jpg" | Triple-green, 23 Dec 2017, CC BY-SA 2.0 | A low front-left view of the mantlet, rangefinder and discharger block |
| Commons "Leopard 1 A2 A1 "Rotland" (51438927896).jpg" | Commons | The front-right: the right flank, the basket and the antennae |
| Wikipedia (en/de), Leopard 1 | — | 2.39 m to the roof; the TEM 2A optical rangefinder with heads either side of the turret; the 1A2's heavier casting; the A2A1's PERI R12; DM23 APFSDS (1979) |
| World of Tanks Tankopedia, "Leopard 1" | — | The owner's look reference: the low cast turret, the cupola and loader's hatch, the basket |

## Turret, third build (current): the 1A5's lines, rounded

The owner turned down the 1A2 casting with its hard chine and asked for the 1A5's turret, slightly rounded, with the
mantlet that ends in a line, the same mantlet the 1A5 now has. The turret takes the 262 Leopard 1A5's design:
- **Core:** the chevron casting at the 1A5's stations. The base is set in under a ridge 0.30 m up, and the upper face
  leans in to a roof at 0.79 m. The feet are lifted to clear the old deck.
- **Side plates:** they run the ridge back to a tail that tapers into the core.
- **Wedges:** they carry the ridge forward either side of the mask. Ahead of z 1.12 their faces close on the ridge, so
  each wedge ends in its line.

These are cast as one with no bolts. Every ridge and roof edge is rounded by two short smoothed segments, 3.5–5 cm along
each face.

The mantlet is the 1A5's wide chevron mask, 1.24 m wide. Its brow and chin meet in a horizontal line ±2 cm at the gun.
The 1A5's own mask was changed the same way: its ridge band was 0.26 m deep.

The kit:
- the Munster 1A2A1's PERI R12, on its pedestal over the right front roof;
- the commander's cupola, the loader's hatch and MG3, the beacon and the ventilator;
- the 1A5's rear dischargers and flank racks, and its loaded basket.

The first build (an egg-section casting with a bell mantlet) and the second (the 1A2 chine casting with rangefinder
drums and front-corner dischargers) were both replaced before reaching main.

**Deck clearance.** The casting's foot stands over the old hull's deck crown at every bearing. The trunnion stands 0.40 m
over the ring, so the mantlet's underside clears the rising engine deck when the gun is laid over the rear.
`leopard1A2A1Source.selftest.mjs` checks every turret vertex outside the ring bearing against the deck within its radius.

**Deck tools.** The deck shovel and crowbar moved from beside the ring onto the fender lockers' lids, out of the
mantlet's sweep.

**Old hull floats seated.** The old hull's tail lights, width-rod balls, locker latches and fuel-can caps all floated,
and each is now seated. `hull-contact-census` reads 0 visible.

## Not drawn

- The XSW-30-U searchlight. The Munster vehicle has none fitted, and the 1A5 carries one in this fleet.
- The cable runs along the turret flanks.
