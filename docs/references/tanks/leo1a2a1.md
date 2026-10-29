# Leopard 1A2A1 (`leo1a2a1`) — reference packet

## Owner asks (2026-10-28)

The owner's requests, verbatim and in order:
- "keep ur new leopard variants and make one that uses the old hull and has like a rounder "unarmored" version that
  looks more like the world of tanks leopard 1"
- "the old turret is still bad and the new turret for leopard is better, but need it to look accurate"
- After the first build: "completely redesign this current leopard. nit needs to take a lot more innspo from thhat 1a2,
  from teh chevron mentlet thhat joins at a line, the turret thhat is a lot better annd not just a ttorus, the boxes, smoke
  canisters, tech etc"

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

## Turret: reference against build

| Feature | Munster 1A2A1 | Build (`profiles/leopard1A2A1.ts`) |
|---|---|---|
| Casting section | Undercut lower face out to a hard horizontal chine. A broad upper face leans in above it and rolls into a flat roof. No egg, no torus | Twelve stations. Each section runs foot → chine (hard edge) → slightly convex upper face → shoulder → roof 1.7 m across. The upper faces and roof are smoothed as one casting; the chine and lower faces stay hard |
| Chine | The widest line, near a third of the height, runs from the mantlet round the cheeks and along the sides | 0.32–0.38 m over the ring, ±1.21 m at its widest |
| Front | Upper and lower faces close on the chine either side of the mantlet: a chevron in profile ending in a line at the gun's height | The front stations converge on the chine, ending in a band 0.13 m deep at z 1.16, 0.38 m over the ring |
| Mantlet | A broad cast block with rounded vertical corners. Its brow and chin meet at a horizontal line on the gun's axis | Gun-owned block 1.0 m wide and 0.62 m tall, corners rounded at 0.10 m. Brow and chin meet at a ridge ±0.035 m on the gun axis. TZF port on the brow at the gun's right, coaxial MG3 port on the chin at its left, collar at the ridge |
| Rangefinder | TEM 2A end housings: short drums across the upper cheeks with domed caps, windows forward | Drums r 0.115 m at z 0.66, 0.52 m up, capped and rimmed, windows and hinged lids forward |
| Smoke | A block of four Wegmann 76 mm tubes on a bracket at each front roof corner, laid forward and out | Mount block, bracket plate and back frame at each corner; four 0.30 m tubes laid 13° up and 13° out |
| Roof | PERI R12 box on its pedestal on the right front. Commander's cupola behind it; loader's hatch and MG3 on the left; rotating beacon on a post; ventilator; two antenna bases | All present |
| Flanks and bustle | Stowage bins on the rear flanks; a loaded basket round the tail | A closed bin with lid and latches on each rear flank over the chine. The basket is loaded with bags, a tarp roll, two jerrycans, an ammunition can and a tool box |
| Appliqué | None (B&V plates are the 1A1A1's) | None |

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
