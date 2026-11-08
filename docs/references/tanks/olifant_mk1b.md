# Olifant Mk 1B (`olifant_mk1b`) — reference packet

## Current status (release 269, 2026-11-02): a new South African Centurion

The 1991 rebuild: tier III in the South Africa tree, between the Mk 1A and the Mk 2 (2007), which converted 26 Mk 1Bs.
Built as the Centurion family's `olifant_mk1b` mark: the Olifant kit (the Mk 2's torsion-bar hull, armoured skirts, glacis
pack and armoured turret, `profiles/centurionFamily.ts`) with the Mk 1B's own fit; spec `southAfricaSpecs.ts` (a clone of
the Mk 2 without its thermal fire control). Photo packet `olifant-centurions-20261102.json`; fixture
`profiles/southAfrica.selftest.mjs`. Implementation: DONE; changed-only regeneration done (9bafdc391c). Blind pairs
against the Mk 2: r7 6/10, r8 5/10 (matched 95 % and 93 %), certified as real twins per Main's ruling below, the Mk 2's
box sight on its post the tell both rounds named.

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
| 2 | the searchlight box above the gun, on its left, laid with it | — | a 0.54 x 0.46 x 0.42 m box on the mantlet housing's top left, its glass behind a louvred shutter (night lens), held in a yoke (an arm up each side to a trunnion boss) with a bolted access panel on its back, on a painted pedestal nearly its width and depth (0.44 x 0.12 x 0.34 m) (269 critics: it read as perched on a thin post from the rear; r7: a 0.16 m dark post under its front read as a thin stem in profile) |
| 3 | the cans racked across the bustle's back, a holder for every can (DSCF4691) | — | an open rack 2.40 m wide and 0.50 m deep with ten jerrycans, on arms under its floor, braced at its ends |
| 4 | the 1990s SANDF three-tone in broad soft patches | the Mk 2's woodland | `paint_olifant_mk1b` "SANDF Blotch Desert" (shared with the TTD) |
| 5 | a bank of four 81 mm dischargers on an open bracket at each rear corner's top edge, raised steeply over the roof line (DSCF4691; TE: "relocation ... to the rear of the turret") | the Mk 2's banks along the side walls, under the roof edge | each bank on a shelf level with the roof off the side's top edge on two diagonal stays, a guard rail along its outer edge in the bracket's painted steel, its tubes raised 46 deg and splayed out (`raisedRearBanks` in the mark's receipt) (r7: on a lower shelf the near tubes sank behind the top edge; r8: black rails read as spindly legs) |

Hull length: TE's 8.30 m (the lengthened engine compartment) is contested (the Mk 2's packet: the Commons profile's
hull length to deck height matches the family's 7.557 m); the build keeps the Mk 2's hull.

### The turret package (Main, 2026-11-04)

The Mk 1B's 1991 package boxes in the whole Centurion turret: TE's "passive composite armor packages over the frontal
glacis plate and turret (front, sides and top)" and "the turret bustle was extended"; the Tempe front, left and rear
photographs (DSCF4690, DSCF4692, DSCF4691) and TE's profile show the slab package from the nose to the overhanging box
bustle, no cast roof or rear. Kit and forum notes: the Mk 2 "looks identical to the original Mk1B", its "only prominent
identification feature" the box-shaped commander's sight. Main ruled (DECISIONS "2026-11-04 Olifant Mk 1B: the real
package governs", superseding a cast-turret ruling): the Mk 1B keeps the shared slab package and only its own tells move
(rows 2, 3 and 5); the Mk 2 is untouched. What likeness to the Mk 2 remains is the real vehicles' and is recorded as
real twins, the Mk 2's box sight the tell.
