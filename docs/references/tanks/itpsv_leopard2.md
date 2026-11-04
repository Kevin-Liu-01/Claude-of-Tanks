# ItPsv Leopard 2 (Leopard 2 Marksman) (`itpsv_leopard2`), run packet

## Current status

- IDs and display names: `itpsv_leopard2`, "ItPsv Leopard 2 (Leopard 2 Marksman)" (`src/vehicles/tankLabels.ts`); fleet group `marksman`.
- Updated: 2026-11-03 (release 269, builder M over the registrar R0's registration).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED PHOTOGRAPHIC BUILD (builder M). The Leopard 2A4's hull and running gear with the
  leo2a4's own options (`profiles/leopard2Hull.ts`, as `profiles/leopard2A4Family.ts` builds it) and the 2A4's hull kit
  (`profiles/leopard2A4Kit.ts` `addLeo2A4HullKit`, a new export, its German rear number off) under the one Marksman turret
  (`profiles/marksmanTurret.ts`, the turret's numbers in `marksman_t55.md`), every spatial datum the spec reads drawn from
  one frame (`profiles/marksmanFrame.ts`); the seven leopard2a4Family ids byte-identical.
- Qualification status: native fixture `src/vehicles/profiles/marksman.selftest.mjs` (both Marksmen, both qualities);
  photographic qualification (a dated packet under `docs/references/photos/`, registered in
  `tools/photo-reference-policy.mjs`) is owed and is the coordinator's: the as-built envelope is 9.29 m with the guns
  forward x 3.67 m (the skirts) x 4.32 m (the radar's top; whips out).
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action (coordinator): register `marksman.selftest.mjs`, then the generated tables for this id: combat
  anatomy (`npm run tank:anatomy:update` and `check`), marking seats, interior fill, presentation anchors, auxiliary
  inventory (the eight smoke tubes), tank assets; the photographic packet; a `nationalGunClearance.selftest.mjs` row for
  the curve below.

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

## Registration numbers (combat rows are final-intent; spatial datums are builder M's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion (the Leopard 2's mobility and protection); after the ItPsv 90 on the UK Marksman line, lane 5 |
| Class / role / status / era | spaa / scout (recon) / service / modern | in service 2016 |
| HP, engine, weight | 2,600 / 1,500 hp (the fleet's 2A4 MB 873; the page's 1,479 hp is the same engine) / 49 t | |
| Speed, reverse, traverse | 72 / 25 km/h (the 2A4's reverse) / 40 and 70 deg/s authored | en.wikipedia |
| Gun arc | -10 / +85 degrees, 50 deg/s; the 2A4's curve dropped for the guns' own stops over the engine deck (at most 1.2 degrees up, yaw 141-180): [[0, -10], [140, -10], [141, -9.3], [142, -9.1], [144, -9.1], [150, -9.6], [154, -10], [155, -9.3], [156, -8.9], [162, -8.8], [174, -8.8], [180, -9.6]] | the curve measured (builder M) |
| 35 mm | the ItPsv 90's rows: APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the same turret and guns |
| Dimensions | hull 7.72 m (the 2A4's), overall 9.29 m with the guns forward (the published 9.30 m: the frame's muzzles 5.13 m ahead of the hull's origin, the stern rack 4.165 m behind it), width 3.70 m (built 3.67 m over the skirts), height 4.32 m (the radar's top 2.68 m over the 1.64 m ring; the published 4.82 m is photo 08's antenna mast, not built) | en.wikipedia; as built |
| Fire axes | the ItPsv 90's: twin, x = +/-1.16 m, 0.38 m over the drums' axis (0.58 m over the ring and 0.16 m ahead of it), the bore mouths 4.60 m ahead of the axis; index 0 the right; the ring the Leopard 2's (0, 1.64, 0.37) | `profiles/marksmanFrame.ts` |
| Turret | the ItPsv 90's: the body's fifteen planar faces as plates, 35 mm walls and a 30 mm roof | `marksman_t55.md` |
| Paint | spec coat and stock: `paint_cv90_mkiv` (Swedish splinter woodland), the closest existing coat to Finland's three-tone (no Finnish Leopard 2A4 exists in the fleet) | no new paint |
| Marking | hull left anchor, "ItPsv" (no number shows in photos 07-08) | |
| Wheels / track | the Leopard 2A4's (`WHEEL_STANDARD_EXCEPTIONS`, donor leo2a4), its track by the same wheel | |
| Audio | `diesel_v12_modern` (the MB 873) | |
| View / camouflage | 450 m, 0.215 / 0.185 | |

## Build (builder M, 269)

The turret is the one Marksman module; its numbers and photographs are in `marksman_t55.md` (Build). This hull:
`buildLeopard2Hull` with the leo2a4's own options (the round-rod exhaust grilles, the early fore-skirt drop, the fuel
fillers, the forward lift eyes on the glacis at z 2.40; photos 07-08: seven road wheels, the side skirts, the glacis's
spare links) and the 2A4's hull kit (`addLeo2A4HullKit`, `rearNumber: false`: the German "Y-241" left off; no number
shows in photos 07-08). Its turret: the adapter `leopard2` (1.06 m over the race's 1.02 m), the pods in the dark weapon
finish (photos 02-08). Triangles (geometry receipt, HIGH): 29,012 (the leo2a4 37,791).

Receipts run by builder M (2026-11-03, worktree `~/cot-lanes/twin-aa-269`, uncommitted over 915f4241bc): the fixture
`src/vehicles/profiles/marksman.selftest.mjs` PASS (both ids, both qualities: the frame's fifteen faces planar, convex and
closed; the rings, axis, bores and muzzle plane; the envelope; the guns 24 mm from the turret's stock through -10 to +85
degrees, the hubs excepted; 30 mm from the hull at every 5 degrees of yaw and pitch from the published stops); the
accessory contact probe 0 floating / 0 clipping; `tools/roof-pocket-census.mjs` none; `tools/gun-junction-census.mjs`
CLOSED at rest, +85 and -10 (the slotted brakes' openings are muzzle-device runs); the gun-hull floors per degree at the
sweep's 26 mm (`~/cot-lanes/twin-aa-269-evidence/M/scripts/hullfloors.mjs`, gunHullClearance's probe) fitted by `tools/gun-depression-sweep.mjs
--envelope`; the geometry digest (`.qa-dev/geodigest2.mjs`) of t55a, type59 and the seven leopard2a4Family ids
byte-identical before and after (`~/cot-lanes/twin-aa-269-evidence/M/digest-{before,after}.json`); the selftests naming the ids or beside the changed files (recoilRig, afvBalance, vehicleAudioProfiles, ammunitionFlow, camoCatalogProductionIndices, nationWheelSets, vehicleFacets, cnGunMantlet, type59Overhaul, equipmentDamage, leopard2A4Family, selftest-tiers) PASS; typecheck
clean in these files (the tree's two remaining errors are in `profiles/lvkv9040.ts`, builder S's). Renders:
`~/cot-lanes/twin-aa-269-evidence/M/r1/` (first build) and `r2/` (final).

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

## Remaining work (coordinator)

- Register `src/vehicles/profiles/marksman.selftest.mjs` in `npm test`.
- The generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats, interior
  fill, presentation anchors, auxiliary inventory, tank assets; a `nationalGunClearance.selftest.mjs` row; the
  photographic packet registration.
- Not built: photo 08's flat antenna on a tripod mast over the roof (the 4.82 m); the Finnish roundels (no `fi` painter).
