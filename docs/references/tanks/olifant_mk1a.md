# Olifant Mk 1A (`olifant_mk1a`) — reference packet

## Current status (release 269, 2026-11-02): a new South African Centurion

The Mk 1 rearmed (1985): tier II in the South Africa tree. Built as the Centurion family's `olifant_mk1a` mark
(`profiles/centurionFamily.ts`; the additive `sa` edit) on `profiles/uk.ts`; spec `southAfricaSpecs.ts` (a clone of the
Mk 5/2 with its own package). Photo packet `olifant-centurions-20261102.json`; fixture `profiles/southAfrica.selftest.mjs`.
Implementation: DONE; regeneration and critics pending.

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/coldwar/south_africa/olifant_mk.i (the stabilised GT3 105 mm, an Israeli L7 first; the Eloptro 8x sight with a laser rangefinder co-mounted; a passive night sight; two banks of four 81 mm; storage racks at the turret's rear for nets; armoured skirts 4.5 mm; 7.56 x 3.39 x 2.94 m, 56 t, 45 km/h; 750 hp; 153 built by the late 1980s) |
| SAAM | https://www.saarmourmuseum.com/olifantmk1a |
| D24 | https://defence24.pl/sily-zbrojne/jak-zbudowac-i-zniszczyc-pancerna-potege-analiza (79 upgraded: contradicts TE's 153) |
| Photos | TE's De Brug photograph ("the additional storage bins at the back of the turret": the long box, tank 21A; the V across the nose) and the live-firing photograph (21A, skirts off); TE's Bocquelet illustration (dark sand) |

### Gap table (photo class)

| # | Photo read | Baseline (the Mk 1 mark) | Build |
|---|---|---|---|
| 1 | the 105 mm with its fume extractor, no thermal sleeve | the 20-pdr | the family's L7 (no sleeve: `isMk52` excludes the SA marks) |
| 2 | a long flat-sided box on the bustle, the turret's width, its top at the roof line, running over the engine deck, the number on its side | the Mk 1's net rack | a 1.84 x 0.62 x 0.84 m box from the casting's back, its lid seams and hasps, a net rack on its back |
| 3 | the bush bar ahead of the nose | — | a V of two tubes from the nose lugs to a point 0.42 m ahead, stays back to the front guards' tips |
| 4 | skirts off, the AVDS deck, the 2x4 dischargers | — | the Mk 1's |
| 5 | SADF nutria brown, tactical number | — | `paint_semel` |

The packet's TE skirts (4.5 mm) and the photographs' skirtless tanks disagree: the build follows the photographs (the
bush, De Brug, Angola).
