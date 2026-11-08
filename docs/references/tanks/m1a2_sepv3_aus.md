# M1A2 SEPv3 (Aus) (`m1a2_sepv3_aus`) — reference packet

## Current status (release 269, 2026-11-02): a new Australian Abrams

Main's ruling 2026-11-02 on the owner's "flesh out south african and australian tank trees": the Australian Army's M1A2
SEPv3 (75 ordered under LAND 907 Phase 2, new turrets on refurbished hulls, delivered from late 2024) at IX in the tree's
tanks line after the M1A1 AIM SA, by the owner's anchor for the M1A2 family (the US SEPv3 at X carries Trophy; this tank
has none); provisional until the same-tier duels run after the regen. Main's condition: its tells real (Trophy's mounts
with no Trophy, the CROWS-LP). Built on the fleet's SEPv3 source study (`src/vehicles/profiles/abramsSourceX.ts`,
`buildAbramsX`; the configuration gains the id: the SEPv3 kit, no urban armour, `trophy: 'mounts'`) with the kit's new
'mounts' fit (`profiles/abramsSourceXSepv3Kit.ts`, `Sepv3TrophyFit`: the brackets, no launcher, radar, counterweight or
controller). The five source-X studies PASS `tools/fleet-geometry-ledger.mjs --check` before the edit (abramsx5-before.log)
and, with `m1a1`, `m1a1ha`, `m1a1_abrams_aim` and `ua_m1a1`, after it (abramsx9-after-r1.log). The owner's heavy field
net, 2026-11-02 ("both the australian variatns nneed a lot of ghillie on them and on their barrels"; "in this case even
drape ghillie acrross the top of mantlet and cheeks"): `src/vehicles/ghillieFleetSuits.ts` row `m1a2_sepv3_aus`. Spec
`src/vehicles/australiaSpecs.ts`: a clone of the US SEPv3 (`m1a2_abrams_sepv3`), 66 t (Asian Military Review), its ARAT
('era') plates gone from the hull and turret armour and its width back to the stock skirts'; Australia fires no depleted
uranium: the tungsten KEW-A2 APFSDS-T replaces the US round (see [m1a1_aim_sa_aus.md](m1a1_aim_sa_aus.md)). Photo packet
`docs/references/photos/aus-abrams-20261102.json`; fixture `src/vehicles/profiles/australia.selftest.mjs` (no ARAT in
the armour; hull, turret and gun netted). Implementation: DONE; qualification: the packet's envelope PASS, regeneration
and critics pending (`docs/history/research/australia-line-269.md`).

### Sources

| Key | Source |
|---|---|
| AMR | https://www.asianmilitaryreview.com/2024/09/m1a2-sepv3-abrams-puts-in-maiden-australian-appearance/ (66 t combat loaded; 75 ordered, Project 907; a first batch of about 27; new turrets on refurbished hulls; the CROWS-LP; Trophy "fitted for future installation", and "APS is planned") |
| W | https://en.wikipedia.org/wiki/M1_Abrams (the SEPv3 66.8 t; 3.66 m wide; 2.44 m high; the M1A2's 0.43 m clearance) |
| R | RESEARCH.md (first shown September 2024; Trophy not fitted, the tank wired and plumbed for it; with 29 M1150 ABV and 17 M1074 JAB, out of the tree as non-combat) |
| Photos | Talisman Sabre 2025 (`side_R_lift_ts2025`: the right profile from a crane lift, the white V); Southern Jackaroo 26 (front 3/4, Commons); the US Army watercraft, 2025 (`side34_watercraft2025`); Defence image library 2024-26 (`crows_detail2025`, `side34_R_wagga2026` in the three-tone, `turret_side_kangaroo2026` with "DIRTY WORK", `top_front_landforces2024`, the creek, hangar and firing shots). US comparison: Commons `M1A2_SEP_V3_Abrams.jpg`, `Cav._M1A2_SEPv3.jpg`, `M1A2_SEP_V3_Abrams_-_200721-A-BT735-440.jpg` (the roof: CROWS-LP and CITV). No clean Australian rear view |

No Australian-specific length or height was found: the US figures stand **[?]**.

### Gap table (photo class)

| # | Photo read | Baseline (the US SEPv3 study, `m1a2_abrams_sepv3`) | Build |
|---|---|---|---|
| 1 | the SEPv3 turret with the CITV and a CROWS-LP (`crows_detail2025` against `us_turret_roof_crows`) | the same | kept |
| 2 | no Trophy launcher or radar panel in any Australian photograph; whether the brackets are fitted cannot be seen **[?]** (AMR: "fitted for future installation") | Trophy HV on each inclined turret flank, four radar panels, two counterweights on the rack, the controller on the roof | the 'mounts' fit: on each flank the wall plate, its bolts and four arms, closed by the launcher's empty interface plate; no launcher, radar, counterweight or controller |
| 3 | the stock skirts and turret flanks, no ARAT (the 2024-26 photographs) | the rectangular ARAT on the skirts and the turret (4.06 m wide) | the stock skirts (3.66 m); the ARAT gone from the build and the armour record |
| 4 | the three-tone where the US tanks are tan (`side34_R_wagga2026`) | tan | `paint_leopard_as1` "RAAC Blotch Desert" (#8a7656 under #57593c and #262620), number 42A |
| 5 | the kangaroo and the turret's name ("DIRTY WORK", `turret_side_kangaroo2026`) | — | `au-army-kangaroo` on the turret's right flank (`vehicleMarkings.ts`); the name not drawn |
| 6 | a large white V chevron (`side_R_lift_ts2025`) | — | not drawn |
| 7 | the tanks in `side34_watercraft2025` look single-colour green **[?]** | — | no second coat authored |
| 8 | — | the kit's under-armour APU, sponson box, data-link boxes, GPS and wind sensor, fender stowage | kept from the US kit |
| 9 | garnish thick over the turret and the whole gun to the muzzle (the Talisman Sabre and Southern Jackaroo photographs) | none | the owner's heavy net: the turret roof and bustle under one net round the CROWS-LP and the sights and over the cheeks to their tips, drapes down both flanks over the empty Trophy brackets, a rear drape over the rack; both decks round the driver's hatch, four drapes a side over the stock skirts; the gun from the mantlet to 0.35 m short of the muzzle. Density 2.3 (the fleet's dense nets 1.8), in the dry bush's olive and straw |

### Datums

The SEPv3 study's (`ABRAMS_SOURCE_X_MEASUREMENTS`): a 7.954 m structural hull, 3.662 m over the stock skirts (4.063 m with
the rectangular ARAT), the turret roof 2.361 m, the muzzle 5.809 m ahead of the hull's origin. As built: 9.805 m over the
gun, 3.872 m across the garnish over the 3.66 m skirts, 4.177 m to the whip's tip (published 3.66 m wide and 2.44 m high,
Wikipedia). Gun depression (`tools/gun-depression-sweep.mjs --no-suit`): 10 degrees dead ahead (to yaw 10) and abeam (yaw
65-115); 7.5-9.9 over the front quarters (yaw 11-64, the study's own); from yaw 127 the deck, and astern the under-armour
APU's louvres hold the gun up: level at yaw 143, +3.0 degrees at 162, +0.2 dead astern.
