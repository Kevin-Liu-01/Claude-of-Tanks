# M1A1 AIM SA (`m1a1_aim_sa_aus`) — reference packet

## Current status (release 269, 2026-11-02): a new Australian Abrams

Main's ruling 2026-11-02 on the owner's "flesh out south african and australian tank trees": the Australian Army's M1A1
AIM SA (59 from 2006-07, the 1st Armoured Regiment; replaced by the SEPv3 from 2024, 49 to Ukraine) at VIII in the tree's
tanks line ("Leopard and Abrams") after the Leopard AS1, provisional until the same-tier duels run after the regen. Main's
condition: its tells real, not a paint swap (the Australian stowage and the three-tone). Built on the fleet's plain M1A1
(`src/vehicles/profiles/abramsAus.ts`, `buildM1A1AimSaAus`: the `m1a1` build, then the Australian kit), not on the
fleet's `m1a1_abrams_sa` or `m1a1_abrams_aim`, which carry ARAT, CROWS and their own nets (the Australian photographs
show no TUSK). No shared builder edited for it; after the Abrams pair landed, nine Abrams ids (the five source-X studies, `m1a1`, `m1a1ha`,
`m1a1_abrams_aim`, `ua_m1a1`) PASS `tools/fleet-geometry-ledger.mjs --check` (abramsx9-after-r1.log). The owner's heavy
field net, 2026-11-02 ("both the australian variatns nneed a lot of ghillie on them and on their barrels"; "in this case
even drape ghillie acrross the top of mantlet and cheeks"): `src/vehicles/ghillieFleetSuits.ts` row `m1a1_aim_sa_aus`.
Spec `src/vehicles/australiaSpecs.ts`: a clone of the M1A1 with export armour (no depleted-uranium layer), 61.3 t (Asian
Military Review: the M1A2 "about five tonnes heavier" than the AIM), the AGT1500, a quicker fire control and a 6.2 s
reload; the M1A1's x1.5 mantlet (`fleetBalancePass.ts`). Australia fires no depleted uranium: GD-OTS's tungsten KEW-A2
APFSDS-T replaces the US round, at the M829A1's footing (740 mm at 100 m, 680 at 1,000 m, 615 at 2,000 m), beside the
M830A1 MPAT. Photo packet `docs/references/photos/aus-abrams-20261102.json`; fixture
`src/vehicles/profiles/australia.selftest.mjs` (the TMAPU, the two-tier rack, hull, turret and gun netted).
Implementation: DONE; qualification: the packet's envelope PASS, regeneration and critics pending
(`docs/history/research/australia-line-269.md`).

### Sources

| Key | Source |
|---|---|
| FAS | https://man.fas.org/dod-101/sys/land/m1.htm (387 in, 9.83 m, with the gun forward; 144 in, 3.66 m wide; 8.0 ft, 2.44 m high; the turret 93.5 in, 2.37 m; 19 in, 0.48 m clearance) |
| W | https://en.wikipedia.org/wiki/M1_Abrams (hull 7.93 m; 9.77 m with the gun forward; the 120 mm M256, L/44) |
| AMR | https://www.asianmilitaryreview.com/2024/09/m1a2-sepv3-abrams-puts-in-maiden-australian-appearance/ (59 tanks held; the M1A2 "about five tonnes heavier") |
| R | RESEARCH.md (Abrams Integrated Management, Situational Awareness; no DU armour per Defence and *Military Balance*, one Army Recognition piece disagreeing; F88 racks inside; Saab Barracuda kits contracted 2007, https://saab.com/newsroom/press-releases/2007/saab-wins-contract-for-australian-army; 49 to Ukraine, October 2024 to December 2025, https://www.twz.com/land/australian-army-unveils-abrams-disguised-as-chinese-tank) |
| KEW | the KEW-A2 APFSDS-T of GD-OTS's 2008 contract: the spec's comment; no source URL in the lane's notes **[?]** |
| Photos | the ADFA open days (2015: `side_L_adfa2015`, left profile; `rear_adfa2015` and `rear34_adfa2015`; 2018: `side_R_adfa2018`, right profile, "BIEN HOA"; 2019: rear 3/4 left); Exercise Hamel 2015 (`side_turret_hamel2015`, call sign 21B); Talisman Sabre 2015 (right side, moving) and 2017 (`turret_kangaroo_ts2017`); Koolendong 2021 and Super Garuda Shield 2023 (front 3/4; the roof's crew stations); Gold Eagle 2013 and training with the US Marines, 2012 (fronts); Commons `Turret_of_Australian_M1A1_Abrams_tank.jpg` |

### Gap table (photo class)

| # | Photo read | Baseline (the fleet's plain M1A1, `m1a1`) | Build |
|---|---|---|---|
| 1 | no TUSK; the commander's .50 and a loader's pintle MAG 58-type gun | the M1A1's CWS .50 and loader's pintle gun | kept |
| 2 | a two-tier bustle rack, the grille doors, the tail-light clusters (`rear_adfa2015`, `rear34_adfa2015`) | the M1A1's rack, its rear frame 3.47 m behind the turret's pivot | the rack lengthened 0.50 m (to 3.97 m): a mesh floor, side and rear rails at the rack's two heights, a raised second tier of rails round its rear |
| 3 | the TMAPU in the rack at the tank's left rear (the viewer's left from astern), a tan panel with a louvred and a round grille across the inboard part of its rear face, a latch outboard (`rear_adfa2015`, ~2.5 mm a pixel on the 3.5 m hull) | — | a black box 0.72 m wide from 0.22 m off the centreline, 0.52 m deep and 0.52 m tall across the rack's joint on the tank's left (receipt `rack-left-rear`), the tan panel, the louvred grille outboard of the round one, the latch |
| 4 | a tall capped pipe beside the TMAPU on its inboard side, rising from the rack well over the box (`rear_adfa2015`) | — | a pipe from the rack floor to 0.23 m over the box, 0.10 m inboard of it, with its cap and T-head |
| 5 | call-sign plates on the bustle rack ("21B", `side_turret_hamel2015`) | — | a plate on the rack's right side rail, clear of the TMAPU, the tank's number on it |
| 6 | two whips at the turret's rear (`rear_adfa2015`) | none on the M1A1 build | not drawn |
| 7 | the black kangaroo on the forward turret side (`turret_kangaroo_ts2017`) | the US build's markings | `au-army-kangaroo` on the turret's right forward flank (`vehicleMarkings.ts`) |
| 8 | the three-tone on every surface | — | `paint_leopard_as1` "RAAC Blotch Desert" (#8a7656 under #57593c and #262620), number 21B |
| 9 | names on the front skirts ("COMANCHE", "BIEN HOA") | — | not drawn |
| 10 | camouflage scrim often over the turret front; garnish thick over the turret and the whole gun to the muzzle (the Talisman Sabre and Southern Jackaroo photographs) | — | the owner's heavy net: the turret roof netted to the bustle's rear wall round the CWS and the sights and over the cheeks to their tips, drapes down both flanks ahead of the bustle stowage, both decks round the driver's hatch, four drapes a side over the skirts, the gun from the mantlet to 0.35 m short of the muzzle; the rack, the TMAPU and the plate bare. Density 2.3 (the fleet's dense nets 1.8), in the dry bush's olive and straw |
| 11 | no Barracuda kit in any downloaded photograph **[?]** | — | not fitted |

### Datums

The fleet's M1A1 (the turret's pivot 1.632 m up and 0.350 m ahead of the hull's origin; the muzzle at hull z 5.80). As
built: 9.772 m over the gun (9.77 m, Wikipedia; FAS 9.83 m), 3.861 m across the garnish over the 3.66 m skirts, 2.816 m to
the M1A1's commander's station (the TMAPU's stack stands lower), the build carrying no whips (FAS: 2.44 m high). Gun depression (`tools/gun-depression-sweep.mjs
--no-suit`): 10 degrees round to yaw 137 (9.7 at its least over the front quarters, yaw 33); astern of yaw 138 the deck
holds it to 1.2 degrees at 147 and 0.5-0.9 degrees from 160 to dead astern.
