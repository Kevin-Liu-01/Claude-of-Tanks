# ItPsv Leopard 2 (Leopard 2 Marksman) (`itpsv_leopard2`), run packet

## Current status

- IDs and display names: `itpsv_leopard2`, "ItPsv Leopard 2 (Leopard 2 Marksman)" (`src/vehicles/tankLabels.ts`); fleet group `marksman`.
- Updated: 2026-11-03 (release 269, registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the fleet's Leopard 2A4 hull and running gear (`profiles/leopard2A4Family.ts`, its real chassis) under the one box Marksman turret with a 35 mm barrel on each side), which builder M replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action: builder M authors the measured build and keeps the spatial datums in the spec file (turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew) equal to the geometry; then the combat-anatomy
  update, marking seats, interior fill, presentation anchors, auxiliary inventory and tank assets for this id (generated
  tables the registrar did not write: the browser's lazy anatomy and marking-seat loaders reject an unknown group until
  they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder M after the registrar): `src/vehicles/marksmanSpecs.ts`, `src/vehicles/profiles/marksman.ts` (and new files beside it: one Marksman turret module carried by both hulls), this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

Finland's ItPsv Leopard 2 at the 2015 Independence Day equipment show (photos 07-08 the whole vehicle, 02-06 the turret,
radar and 35 mm): the Leopard 2A4 hull (seven road wheels, side skirts) carrying the Marconi Marksman turret, the ring
adapted to the Leopard 2's, in Finland's green, black and grey three-tone. The same turret as the T-55 Marksman. Filed under
the UK, the turret's maker.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 | en.wikipedia "Marksman anti-aircraft system" |
| Mass | 49 t | en.wikipedia |
| Length / width / height | 9.30 m guns forward / 3.70 m / 4.82 m | en.wikipedia |
| Guns | the Marksman turret's two 35 mm Oerlikon KDA, 460 + 40 rounds | en.wikipedia |
| Gun arc | -10 to +85 degrees | en.wikipedia (the turret's) |
| Engine | the Leopard 2's twin-turbo V12, 1,479 hp (1,103 kW) at 2,600 rpm | en.wikipedia |
| Speed / range | 72 km/h / 550 km | en.wikipedia |
| Production | seven, 2014-15; conversion from 2015, in service 2016 | en.wikipedia; the owner |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion (the Leopard 2's mobility and protection); after the ItPsv 90 on the UK Marksman line, lane 5 |
| Class / role / status / era | spaa / scout (recon) / service / modern | in service 2016 |
| HP, engine, weight | 2,600 / 1,500 hp (the fleet's 2A4 MB 873; the page's 1,479 hp is the same engine) / 49 t | |
| Speed, reverse, traverse | 72 / 25 km/h (the 2A4's reverse) / 40 and 70 deg/s authored | en.wikipedia |
| Gun arc | -10 / +85 degrees, 50 deg/s; the 2A4's traverse curve dropped | |
| 35 mm | the ItPsv 90's rows: APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the same turret and guns |
| Dimensions | hull 7.72 m (the 2A4's), overall 9.30 m, width 3.70 m, height 4.82 m | en.wikipedia |
| Fire axes | twin, x = +/-1.40 m; muzzles 4.20 m ahead of a trunnion 0.60 m ahead of the ring (placeholder) | |
| Turret | the ItPsv 90's box, 35/40 mm | placeholder |
| Paint | spec coat and stock: `paint_cv90_mkiv` (Swedish splinter woodland), the closest existing coat to Finland's three-tone (no Finnish Leopard 2A4 exists in the fleet) | no new paint |
| Marking | hull left anchor, "ItPsv" (no number shows in photos 07-08) | |
| Wheels / track | the Leopard 2A4's (`WHEEL_STANDARD_EXCEPTIONS`, donor leo2a4), its track by the same wheel | |
| Audio | `diesel_v12_modern` (the MB 873) | |
| View / camouflage | 450 m, 0.215 / 0.185 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/marksman/` (comparison only; never shipped). This id is photos 02-08 (07-08 the whole vehicle); 01 and 09-10 show the same turret on other hulls.

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [Marksman SPAAG.jpg](https://commons.wikimedia.org/wiki/File:Marksman_SPAAG.jpg) | MoRsE | CC BY-SA 3.0 | 2008-06-03 |
| 02 | [Kalustoesittely itsenäisyyspäivä 2015 19 Leopard 2 Marksman turret.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_19_Leopard_2_Marksman_turret.JPG) | MKFI | Public domain | 2015-12-06 |
| 03 | [Kalustoesittely itsenäisyyspäivä 2015 20 Leopard 2 Marksman turret.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_20_Leopard_2_Marksman_turret.JPG) | MKFI | Public domain | 2015-12-06 |
| 04 | [Kalustoesittely itsenäisyyspäivä 2015 22 Leopard 2 Marksman radar.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_22_Leopard_2_Marksman_radar.JPG) | MKFI | Public domain | 2015-12-06 |
| 05 | [Kalustoesittely itsenäisyyspäivä 2015 23 Leopard 2 Marksman Oerlikon 35 mm.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_23_Leopard_2_Marksman_Oerlikon_35_mm.JPG) | MKFI | Public domain | 2015-12-06 |
| 06 | [Kalustoesittely itsenäisyyspäivä 2015 24 Leopard 2 Marksman Oerlikon 35 mm.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_24_Leopard_2_Marksman_Oerlikon_35_mm.JPG) | MKFI | Public domain | 2015-12-06 |
| 07 | [Kalustoesittely itsenäisyyspäivä 2015 12 Leopard 2 Marksman.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_12_Leopard_2_Marksman.JPG) | MKFI | Public domain | 2015-12-06 |
| 08 | [Kalustoesittely itsenäisyyspäivä 2015 13 Leopard 2 Marksman.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_13_Leopard_2_Marksman.JPG) | MKFI | Public domain | 2015-12-06 |
| 09 | [Markoni Marksman ‘03 EB 10’ (51294781146).jpg](https://commons.wikimedia.org/wiki/File:Markoni_Marksman_%E2%80%9803_EB_10%E2%80%99_(51294781146).jpg) | Alan Wilson from Peterborough, Cambs, UK | CC BY-SA 2.0 | 2021-05-23 |
| 10 | [Marksman Anti-Aircraft System (50497475972).jpg](https://commons.wikimedia.org/wiki/File:Marksman_Anti-Aircraft_System_(50497475972).jpg) | Airwolfhound from Hertfordshire, UK | CC BY-SA 2.0 | 2020-10-10 |

## Construction work order (builder M)

- Replace the placeholder with the measured build on the base vehicle's own hull and running-gear builders (default-off
  options only, every sharing id byte-identical by digest); keep the spec's turret and gun pivots, fire axes
  (`gun.muzzles`), turret plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and fittings through the whole pitch range at every yaw (a clearance probe in the group's own
  selftest, as `profiles/chineseAirDefense.selftest.mjs`).
- Build the Marksman turret once, as its own module, and seat it on each hull's ring (the T-55's and the Leopard 2A4's).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
