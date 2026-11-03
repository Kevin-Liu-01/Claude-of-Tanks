# Olifant Mk 1B (`olifant_mk1b`) — reference packet

## Current status (release 269, 2026-11-02): a new South African Centurion

The 1991 rebuild: tier III in the South Africa tree, between the Mk 1A and the Mk 2 (2007), which converted 26 Mk 1Bs.
Built as the Centurion family's `olifant_mk1b` mark: the Olifant kit (the Mk 2's torsion-bar hull, armoured skirts, glacis
pack and armoured turret, `profiles/centurionFamily.ts`) with the Mk 1B's own fit; spec `southAfricaSpecs.ts` (a clone of
the Mk 2 without its thermal fire control). Photo packet `olifant-centurions-20261102.json`; fixture
`profiles/southAfrica.selftest.mjs`. Implementation: DONE; regeneration and critics pending.

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/coldwar/south_africa/olifant-mk1b-main-battle-tank/ (44 built by OMC; torsion bars, a double floor, the lengthened engine compartment; passive composite packs on the glacis and turret, spaced from the Mk 1A turret; the IR/white searchlight added above the main gun; the dischargers moved to the turret's rear; the GT3B with its thermal sleeve and fume extractor; 8.30 x 3.43 x 3.04 m, 59 t, 850 hp, 58 km/h) |
| AT | https://www.army-technology.com/projects/olifant-mk1b-main-battle-tank/ (900 hp) |
| TE2 | https://tanks-encyclopedia.com/modern/south-africa/Olifant-mk2-main-battle-tank (the Mk 2's stabilised commander's thermal sight is its outward tell) |
| Photos | TE's Tempe museum Mk 1B: left (the searchlight box over the gun's left), front, and rear (a rack of cans across the bustle's back, the 4-tube banks raised at its corners); TE's Bocquelet illustration |

### Gap table (photo class)

| # | Photo read | Baseline (the Mk 2 mark) | Build |
|---|---|---|---|
| 1 | no stabilised sight on a post | the Mk 2's sight post and head | left off for the Mk 1B (`buildOlifantRoof(P, m)`) |
| 2 | the searchlight box above the gun, on its left, laid with it | — | a 0.44 x 0.40 x 0.42 m box on the mantlet housing's top left, its glass behind a louvred shutter (night lens), on a bracket |
| 3 | the cans racked across the bustle's back | — | an open rack 2.30 m wide with six jerrycans, on arms from the bustle |
| 4 | the 1990s SANDF three-tone in broad soft patches | the Mk 2's woodland | `paint_olifant_mk1b` "SANDF Blotch Desert" (shared with the TTD) |

Hull length: TE's 8.30 m (the lengthened engine compartment) is contested (the Mk 2's packet: the Commons profile's
hull length to deck height matches the family's 7.557 m); the build keeps the Mk 2's hull.
