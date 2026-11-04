# Type 87 Self-Propelled Anti-Aircraft Gun (`type87_aw`), run packet

## Current status

- IDs and display names: `type87_aw`, "Type 87 Self-Propelled Anti-Aircraft Gun" (`src/vehicles/tankLabels.ts`); fleet group `type87`.
- Updated: 2026-11-03 (release 269, registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the fleet's Type 74 hull and running gear (`profiles/type74Family.ts`, its real chassis) under a box turret with one 35 mm barrel on each side), which builder J replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action: builder J authors the measured build and keeps the spatial datums in the spec file (turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew) equal to the geometry; then the combat-anatomy
  update, marking seats, interior fill, presentation anchors, auxiliary inventory and tank assets for this id (generated
  tables the registrar did not write: the browser's lazy anatomy and marking-seat loaders reject an unknown group until
  they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder J after the registrar): `src/vehicles/type87Specs.ts`, `src/vehicles/profiles/type87.ts` (and new files beside it), this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

The JGSDF Type 87 (87AW) at Camp Shimoshizu, 2018 (vehicle 96-5192; 96-5442 for the turret details 09-11), in the JGSDF
green and brown two-tone. The Type 74 hull and five-road-wheel hydropneumatic running gear under the boxy Type 87 turret:
a 35 mm KDA in an external mount on each turret side (long L/90 barrels with muzzle brakes, the feed housings), the
search radar on a tall rear post (the drum-backed dish), the tracking radar on the turret front, the optical sight and
periscopes, smoke dischargers. Photo 01 is the right side (radar up), 03-06 the front quarters, 07 the rear, 02/08 the
radars, 09-11 the turret rear.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (commander, driver, gunner) | en.wikipedia "Type 87 self-propelled anti-aircraft gun" |
| Mass | 38.0 t | en.wikipedia |
| Length / width | 7.99 m / 3.18 m | en.wikipedia |
| Height | 3.25 m radar retracted, 4.40 m erected | en.wikipedia |
| Guns | two Oerlikon 35 mm KDA (35 x 228 mm, Japan Steel Works licence), 550 rpm each; 310 AA + 20 AP rounds a gun | en.wikipedia |
| Muzzle velocity | 1,175 m/s HEI / SAPHEI, 1,385 m/s APDS | en.wikipedia |
| Gun arc | -5 to +85 degrees, 360 degrees traverse | en.wikipedia |
| Engine | Mitsubishi 10ZF22WT two-stroke air-cooled V10 diesel, 720 hp at 2,200 rpm | en.wikipedia |
| Speed / range | 53 km/h / 300 km | en.wikipedia |
| Radars | pulse-Doppler search (~20 km), dish tracking radar | en.wikipedia |
| Service | 1987; 52 built 1987-2002 | en.wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; Japan's STB-1 to Type 10 line, off the Type 74 on lane 1 (lane 0 carries the Type 74's run to the Type 90, lane 2 the Hayate's to the Type 89) |
| Class / role / status / era | spaa / scout (recon) / service / cold-war | in service 1987, on the cold-war Type 74 |
| HP, engine, weight | 2,350 / 720 hp / 38 t | |
| Speed, reverse, traverse | 53 / 20 km/h (the Type 74's reverse) / 38 and 70 deg/s authored (the recon doctrine raises them as the 268 set's) | en.wikipedia |
| Gun arc | -5 / +85 degrees, 50 deg/s; the Type 74's traverse curve and hydropneumatic gun-laying dropped | en.wikipedia |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 620 rounds; 0.35 s | the Gepard 1A2's KDA rows (gepardSpecs.ts), the same gun; the published 620 + 40 load |
| SAM | none | |
| Fire control | 0.25 accuracy, 1.05 s aim | the Gepard's |
| Fire axes | twin, x = +/-1.40 m; muzzles 3.90 m ahead of the trunnion (placeholder) | 7.99 m overall on the 6.70 m hull |
| Turret | box 2.30 x 1.01 x 2.90 m, 20/25 mm (aluminium turret) | placeholder |
| Paint | spec coat and stock: Japan's Factory coat `service_type10` (the JGSDF two-tone of the Type 74 and Type 90) | no new paint |
| Marking | hull left anchor, number "87" (the Type 74 carries "74") | |
| Wheels / track | the Type 74's Type 10 face (`WHEEL_STANDARD_EXCEPTIONS`); its double-pin track (`trackPatterns.ts`) | |
| Audio | `diesel_two_stroke`, the Type 74's | |
| View / camouflage | 440 m, 0.230 / 0.200 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/type87/` (comparison only; never shipped). The owner's look is photo 01 (parade, right side, radar up).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) right side view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_right_side_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 02 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) searching radar & tracking radar right side view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_searching_radar_%26_tracking_radar_right_side_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 03 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) left front view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_left_front_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 04 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) left front view at Camp Shimoshizu April 29, 2018 02.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_left_front_view_at_Camp_Shimoshizu_April_29,_2018_02.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 05 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) front view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_front_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 06 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) front view at Camp Shimoshizu April 29, 2018 02.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_front_view_at_Camp_Shimoshizu_April_29,_2018_02.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 07 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) behind view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_behind_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 08 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) searching radar & tracking radar behind view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_searching_radar_%26_tracking_radar_behind_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 09 | [Detail of JGSDF Type 87 self-propelled anti-aircraft gun(96-5442) turret right rear view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:Detail_of_JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5442)_turret_right_rear_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 10 | [Detail of JGSDF Type 87 self-propelled anti-aircraft gun(96-5442) turret right rear view at Camp Shimoshizu April 29, 2018 02.jpg](https://commons.wikimedia.org/wiki/File:Detail_of_JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5442)_turret_right_rear_view_at_Camp_Shimoshizu_April_29,_2018_02.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 11 | [Detail of JGSDF Type 87 self-propelled anti-aircraft gun(96-5442) turret left rear view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:Detail_of_JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5442)_turret_left_rear_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |

## Construction work order (builder J)

- Replace the placeholder with the measured build on the base vehicle's own hull and running-gear builders (default-off
  options only, every sharing id byte-identical by digest); keep the spec's turret and gun pivots, fire axes
  (`gun.muzzles`), turret plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and fittings through the whole pitch range at every yaw (a clearance probe in the group's own
  selftest, as `profiles/chineseAirDefense.selftest.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
