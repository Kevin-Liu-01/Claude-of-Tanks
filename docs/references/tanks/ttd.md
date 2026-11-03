# Olifant TTD (`ttd`) — reference packet

## Current status (release 269, 2026-11-02): a new South African build on the Leopard 2

Project Loggim's Tank Technology Demonstrator (one prototype, finished 1992; Reumech OMC the hull, Lyttelton Engineering
Works the turret and gun; at the SA Armour Museum since 1996-97): the South African special at tier IV (Main's ruling
2026-11-02). The owner, the same day: "the ttd needs to properly be based on an actual leopard 2". Built on the fleet's
Leopard 2 (`src/vehicles/profiles/ttd.ts`): the release's Leopard 2-pattern hull and seven-wheel gear
(`profiles/leopard2Hull.ts`) and the 2A4 turret with its square block front (`profiles/leopard2A4Turret.ts`), composed
through their exported builders, no shared file edited; the TTD's own fit over them. Spec `southAfricaSpecs.ts`: the
Leopard 2A4's record re-enveloped on the construction (`leopard2A4FamilyArmor`), then the TTD's mobility, gun and
protection. In the new `southAfrica` fleet group (`profiles/southAfrica.ts`). Photo packet
`docs/references/photos/olifant-ttd-20261102.json`; fixture `profiles/southAfrica.selftest.mjs`. Implementation: DONE;
regeneration and critics pending. (A first, independent photo-class build, 2026-11-02, was replaced before landing.)

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/modern/south-africa/tank-technology-demonstrator/ (hull 7.78 x 3.62 x 2.99 m, 58.3 t; seven dual rubber-tyred road wheels on Leopard 2-based torsion bars, four return rollers, rear sprocket and front idler; the 51-calibre rifled 105 mm in its thermal shield with a muzzle reference system, -10/+20; the sunken commander's cupola on the right with six periscopes; the CS60N and GS60 sights; two banks of four 81 mm behind an armour sheet; blow-off panels in the bustle; D. Bocquelet's side elevation) |
| SAAM | https://www.saarmourmuseum.com/tanktechnologydemonstrator (twin-turbo V-8 diesel 1,234 hp, 71 km/h, 4F/2R; the 105 mm GT3 for testing, the 120 mm GT6 for production; 750 mm effective glacis) |
| W | https://en.wikipedia.org/wiki/Loggim_program |
| Photos | TE's parade (head-on, "TTD 001 M"), mobility, live-firing and top-down photographs |

### The Leopard 2 and the TTD's own fit

| # | Photo / source read | Build |
|---|---|---|
| 1 | Leopard 2A4-like: seven road wheels, four return rollers, rear sprocket, the slab turret with flat cheeks either side of the gun's slot and the commander's cupola on the right | the release Leopard 2 hull and gear; the 2A4 turret's block front (`buildLeopard2A4Turret`, gun 'L44', front 'block') |
| 2 | the two banks of four 81 mm dischargers on the roof's side edges behind an armour sheet | the 2A4's rear-corner blocks left off (`smoke: false`); four tubes a side raised forward behind the cupolas, the sheet over each wall's top edge |
| 3 | the loader's 7.62 mm | the FN MAG on the loader's ring (`loaderMG: 'mag'`) |
| 4 | no rear box; bins on the bustle's sides; whips standing | `rearBox: false`, `sideBins`, `whips` |
| 5 | "TTD 001 M" on the lower nose | a stencil on the lower glacis |
| 6 | the SANDF three-tone | `paint_olifant_mk1b` "SANDF Blotch Desert" (the Mk 1B's 1990s coat), number 01 |
| 7 | the 51-calibre 105 mm GT3 in its thermal sleeve | the 2A4's sleeved L/44 tube (4.10 m ahead of the trunnion against the GT3's about 3.9 m; its girth within 1 cm): the spec fires the 105 mm with the Mk 2's rounds |

The build's envelope is the Leopard 2's (3.67 m over the skirts, 10.06 m over the gun, against TE's 3.62 m and 9.41 m for
the TTD's own hull): the owner's Leopard 2 basis governs; the raised engine deck of Bocquelet's elevation is the TTD's
own hull and is not drawn on the Leopard 2's.
