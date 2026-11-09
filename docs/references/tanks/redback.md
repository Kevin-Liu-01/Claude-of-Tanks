# AS21 Redback (`redback`) — reference packet

## Current status (release 269, 2026-11-02): a new Australian build

Main's ruling 2026-11-02 on the owner's "flesh out south african and australian tank trees": the Hanwha AS21 Redback
(LAND 400 Phase 3; 129 ordered in December 2023, built at Geelong, deliveries from 2027) at VI at the head of the tree's
cavalry line, after the M113AS4 it replaces; on the Puma S1's footing (the 30 mm, the Spike, the hard-kill protection),
above the K21 and its LAND 400 rival the KF41 at V; provisional until the same-tier duels run after the regen. A new
photo-class first-party build (`src/vehicles/profiles/redback.ts`, `buildRedback`; datums `src/vehicles/redbackDatums.ts`),
not on the fleet's K21: seven road wheels to the K21's six, a different hull and turret. In the `australia` fleet group
(`profiles/australia.ts`). Spec `src/vehicles/australiaSpecs.ts`: a clone of the Puma S1, its combat envelope refitted on
the build's own datums at the Puma's protection, 42 t, 1,000 hp, crew 3, Iron Fist as hard-kill protection
(`protectionSuite.hardKillAps`), the missile named Spike LR2. Photo packet `docs/references/photos/aus-redback-20261102.json`;
fixture `src/vehicles/profiles/australia.selftest.mjs` (seven road wheels). Implementation: DONE; qualification: the
packet's envelope PASS, regeneration and critics pending (`docs/history/research/australia-line-269.md`).

### Sources

| Key | Source |
|---|---|
| HAN | https://hanwha-defence.com.au/redback-ifv (8.8 m long, 3.6 m wide, 3.8 m high; crew 3 + 6; the Mk44 30 mm, a MAG 58, two Spike LR2; the spec sheet `spec_sheet_hda.jpg`) |
| AT | https://www.army-technology.com/projects/as21-redback-infantry-fighting-vehicle/ (the same 8.8, 3.6 and 3.8 m; the Mk44S 30 x 173; Iron Fist; the MTU of 1,000 hp; rubber tracks) |
| JAN | https://www.janes.com/defence-news/australia-signs-usd24-billion-contract-with-hanwha-for-ifv-requirement (7.9 x 3.64 x 3.75 m, 42 t) |
| R | RESEARCH.md, from https://euro-sd.com/2023/07/news/33076/as21-redback-emerges-victorious-in-australias-land-400-phase-3-ifv-contest/ and https://defence24.pl/sily-zbrojne/redback-ewolucja-bwp-z-korei-analiza (the EOS/Elbit T2000 two-man turret; the EOS R400 station, A$108 m, October 2025; the Allison X1100, Soucy composite rubber tracks, in-arm hydropneumatics; 3 + 8, army-technology 6; not amphibious; Plasan slabs; the fleet by 2028) |
| Photos | the 2021 live-fire left profile (`side_L_livefire2021`, Defence: near-square, 208 px a metre on the 7.9 m hull); the production-standard vehicle at the test track (`front34_L_hace_testtrack`, Hanwha); Commons `Hanwha_AS21_Redback_Australian_IFV.png` (`front_commons_cc0`, head-on, CC0); Defence image library (`front34_L_russell2021`, `side34_R_2020`, the 2021 trials, `sensor_detail_landforces2024`, `side_detail_landforces2024`, the 2026 Mexeflote and landing-craft shots); Hanwha's sand prototype (`side34_L_sand_rb10471`, `side_L_wide_sand`) and olive-turreted vehicle (`front34_od_turret`). No square rear view |

The 7.6 m in the lane's brief and RESEARCH.md traces only to a forum post **[?]**. NOTES.md section 7 reads six road
wheels; every photograph shows seven, and the build has seven.

### Gap table (photo class)

| # | Photo read | Baseline (the fleet's K21, `k21`, not built on) | Build |
|---|---|---|---|
| 1 | seven road wheels a side, the sprocket ahead, the idler high astern (`side_L_livefire2021`, `front34_L_hace_testtrack`) | six road wheels | seven 0.53 m road wheels on a 0.78 m pitch on in-arm arms; the sprocket ahead, the idler high astern, three small return rollers hidden behind the skirt |
| 2 | rubber band tracks with block lugs; skirts over the upper run (`front34_L_russell2021`) | — | Soucy's composite rubber band, 0.55 m wide, two staggered lugs a pitch (`rubberBandShoe`); the lower appliqué course a skirt over the wheels' tops, its front edge raked back clear of the sprocket (`front34_L_hace_testtrack`) |
| 3 | a tall, flat-sided hull under bolted appliqué, a ledge at the courses' joint, a dense grid of bolt heads | the K21's 6.9 m hull and flotation screens (RESEARCH.md) | the 7.9 m hull (Janes); two courses a side, the ledge at 1.24 m, eleven seams a side about 0.66 m apart, a bolt-head pair either side of each |
| 4 | the upper front plate's square lamp clusters in barred guards at the corners, the long glacis to the turret (`front_commons_cc0`) | — | the lamp clusters (two white lamps, an amber indicator outboard) behind bars; the 11-degree glacis from the 1.50 m nose to the roof's knee; the driving camera's hood on the centre line (`sensor_detail_landforces2024`); mirrors on stalks; the driver's periscopes and hatch at the front left |
| 5 | the tall, faceted T2000: the long 30 mm in its housing, the Spike LR2 box on the turret's left, Iron Fist launchers and sensors at the corners (`sensor_detail_landforces2024`, `front34_L_russell2021`, `front34_od_turret`) | the K21's turret | the taller left block (to 2.90 m) and the lower right half (2.70 m), both with arrowhead prows; the Mk44S in a vented cradle housing between them, 5 cm left of the ring; the Spike twin launcher on the left wall; Iron Fist twin-tube launchers and four dischargers on pedestals at both rear corners; sensor panels on both walls and the rear face's corners |
| 6 | a roof sight; a remote weapon station on the 2021 trial vehicles | — | the commander's panoramic sight on the right half; the EOS R400 with its 12.7 mm on the left block |
| 7 | the round exhaust grille on the right side (`side34_R_2020`, `side_detail_landforces2024`) | — | on the right side's upper course |
| 8 | no square view of the rear ramp **[?]** | — | the rear plate from the 3/4 views: the ramp and its door, the tail-light clusters, the towing hooks, a step frame at each rear corner (`front34_L_hace_testtrack`, `side34_R_2020`); two roof hatches aft, the whips on the rear corners |
| 9 | the 30 mm muzzle 0.8 m inside the nose with the gun ahead (`side_L_livefire2021`) | — | the muzzle at hull z 3.15 against the nose at 3.95: Hanwha's 8.8 m is not reached |
| 10 | prototypes in sand; trial and production vehicles in the three-tone (`front34_L_hace_testtrack`) | — | `paint_leopard_as1` "RAAC Blotch Desert" (#8a7656 under #57593c and #262620), number 31A; the Army's kangaroo on the hull's right side |

The length: the build comes out 8.37 m against Hanwha's 8.8 m because the 2021 live-fire profile puts the 30 mm muzzle
0.8 m inside the nose with the gun ahead; the build follows the photograph and Janes' 7.9 m hull, and Hanwha's 8.8 m is
not reached.

### Datums

Janes' 7.9 m hull (the nose and the stern 3.95 m from the middle), 3.64 m over the appliqué's ledges (Janes 3.64 m,
Hanwha 3.6 m), the roof 2.00 m, the belly 0.46 m, the stations read off the 2021 live-fire profile; the turret ring 0.30 m
behind the hull's middle, the trunnion 0.95 m ahead of the ring and 5 cm left, the Mk44S 2.50 m from the trunnion to the
muzzle. As built: 8.365 m long over the rear step frames and the lamp guards, 3.641 m wide, 4.48 m to the whips' tips; the
turret's left block 2.90 m, the remote station's gun 3.52 m (Hanwha 3.8 m and Janes 3.75 m high: what those are measured
to is not stated **[?]**). Gun depression: no measured curve yet (its `tools/gun-depression-sweep.mjs --no-suit` run has
produced none) **[?]**.
