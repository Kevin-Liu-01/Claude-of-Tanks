# Marksman (T-55): the Finnish ItPsv 90 (`marksman_t55`), run packet

## Current status

- IDs and display names: `marksman_t55`, "Marksman (T-55)" (`src/vehicles/tankLabels.ts`); fleet group `marksman`.
- Updated: 2026-11-03 (release 269, builder M over the registrar R0's registration).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED PHOTOGRAPHIC BUILD (builder M). The fleet's T-55A hull and running gear exactly as
  the T-55A builds them (`profiles/t54Family.ts` `buildT55AHull`, a new export: the T-55A and the Type 59 byte-identical)
  under the one Marksman turret (`profiles/marksmanTurret.ts`), every spatial datum the spec reads drawn from one frame
  (`profiles/marksmanFrame.ts`); the build section below has the numbers and the photographs they came from.
- Qualification status: native fixture `src/vehicles/profiles/marksman.selftest.mjs` (both Marksmen, both qualities);
  photographic qualification (a dated packet under `docs/references/photos/`, registered in
  `tools/photo-reference-policy.mjs`) is owed and is the coordinator's: the as-built envelope is 8.22 m with the guns
  forward x 3.31 m (the fenders) x 4.10 m (the radar's top; whips out).
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action (coordinator): register `marksman.selftest.mjs`, then the generated tables for this id: combat
  anatomy (`npm run tank:anatomy:update` and `check`; the spec's turret pivot is the T-55's drawn ring at 1.42 m, not the
  T-55A spec's donor pivot), marking seats, interior fill, presentation anchors, auxiliary inventory (the eight smoke
  tubes), tank assets; the photographic packet; a `nationalGunClearance.selftest.mjs` row for the curve below.

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

Finland's ItPsv 90 (photo 01, Helsinki, "Ps465-22"): a T-55 hull (five road wheels, the T-55's deck, the long rear fuel
drums) under the Marconi Marksman turret, a wide faceted turret with the two 35 mm Oerlikon KDA in armoured side pods
(long barrels, slotted muzzle brakes), the tracking and search radar on a short mast with its dish at the roof rear-left,
the commander's sight; Finland's three-tone (green, black and grey). Photos 02-08 show the same turret on Finland's
Leopard 2 (the turret's detail), 09-10 the UK's Chieftain Marksman. Filed under the UK, the turret's maker; the game has no
Finland tree.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (driver, gunner, commander) + back-up crew | en.wikipedia "Marksman anti-aircraft system" |
| Mass | 41 t (the T-55AM 36 t) | en.wikipedia |
| Guns | two 35 mm Oerlikon KDA, 18 rounds a second together; 460 fragmentation + 40 anti-tank rounds (the infobox's 440 is not used) | en.wikipedia |
| Muzzle velocity / range | 1,175 m/s / 4,000 m | en.wikipedia |
| Gun arc | -10 to +85 degrees, 360 degrees | en.wikipedia |
| Radar | Marconi 400 series X/J band, 12 km search, 10 km track; laser rangefinder 8 km | en.wikipedia |
| Protection | the turret proof against 14.5 mm and 155 mm air bursts | en.wikipedia |
| Engine | V-55 V12 diesel, 620 hp | en.wikipedia |
| Smoke | eight Wegmann 76 mm dischargers | en.wikipedia |
| Service | seven ordered by Finland in 1990, in service 1990, to war-time storage 2010 | en.wikipedia |
| Dimensions | not published for the T-55 version | |

## Registration numbers (combat rows are final-intent; spatial datums are builder M's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; the UK tree's new Marksman line (the T-55 first), off the Chieftain Mk 10 (the Marksman was trialled on the Chieftain) on lane 5 |
| Class / role / status / era | spaa / scout (recon) / service / modern | in service 1990, as the 2K22M of 268 |
| HP, engine, weight | 2,400 / 620 hp / 41 t | |
| Speed, reverse, traverse | 50 / 12 km/h (the T-55A's reverse) / 36 and 70 deg/s authored | the T-55's 50 km/h |
| Gun arc | -10 / +85 degrees, 50 deg/s; the T-55A's curve dropped for the guns' own stops over the stern (at most 1.3 degrees up, yaw 141-178): [[0, -10], [140, -10], [141, -9.7], [144, -9.7], [148, -9.3], [150, -8.7], [153, -8.7], [154, -10], [166, -10], [168, -9], [169, -8.7], [171, -8.7], [172, -8.9], [173, -10], [176, -9.7], [178, -9.7], [180, -10]] | en.wikipedia; the curve measured (builder M) |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the Gepard 1A2's KDA rows, the same gun |
| Dimensions | hull 6.04 m (the T-55A's), overall 8.20 m with the guns forward (built 8.22 m: the muzzles 4.68 m ahead of the hull's centre, the drums 3.54 m behind it), width 3.27 m (built 3.31 m over the fenders), height 4.10 m (the radar's top 2.68 m over the 1.42 m ring) | as built; valka.cz (the turret 2,705 mm with the radar in its firing position) |
| Fire axes | twin, x = +/-1.16 m, 0.38 m over the drums' axis (0.58 m over the ring and 0.16 m ahead of it), the bore mouths 4.60 m ahead of the axis; index 0 the right; the ring the T-55's (0, 1.42, -0.08) | `profiles/marksmanFrame.ts` |
| Turret | the measured Marksman turret: its body's fifteen planar faces as plates, 35 mm walls and a 30 mm roof (CE +5 mm); the optics under the sights, the guns' pods as the external gun module; the gunner (+x) and the commander side by side | en.wikipedia (14.5 mm proof); valka.cz (roof 30 mm) |
| Paint | spec coat and stock: `paint_cv90_mkiv`, the CV90 Mk IV's Swedish splinter woodland (green, black and a grey-green), the closest existing coat to Finland's three-tone | no new paint |
| Marking | hull left anchor, number "465-22" (photo 01, "Ps465-22") | |
| Wheels / track | the T-55A's (the period starfish while `T54_STARFISH_WHEELS` holds), its track by the same wheel | |
| Audio | `diesel_v12_soviet` (the V-55) | |
| View / camouflage | 445 m, 0.225 / 0.195 | |

## Build (builder M, 269): the one Marksman turret

Frame: turret-local metres (the ring's centre on the ring plane, +z forward, +x the vehicle's left); the guns gun-local
about the drums' axis. Every number is a constant in `src/vehicles/profiles/marksmanFrame.ts`, which the build
(`profiles/marksmanTurret.ts`, one module any hull seats through `buildMarksmanTurret(P, { adapter, ring, darkPods })`)
and both specs (`marksmanSpecs.ts`) read.

| Part | Numbers | From |
| --- | --- | --- |
| Ring and adapter | the turret on each hull's own ring (T-55A: 0, 1.42, -0.08; Leopard 2: 0, 1.64, 0.37), through an adapter ring (0.97 m in radius on the T-55's 1.816 m ring; 1.06 m over the Leopard 2's 1.02 m race), a collar 0.70 m in radius to the body's floor 0.14 m over the ring | Wikipedia ("installed by the use of an adapter ring"); photo 08 (the collar 0.17 m), photos 03, 10 (the collar about the floor's width) |
| Body | one welded solid of fifteen planar faces: 3.02 m long (rear face 1.62 m behind the ring, the prow 1.40 m ahead), 1.60 m across its sides, 1.32 m across the roof, the roof 1.30 m over the ring; the roof-edge chamfers 0.14 m; the lower chamfer from the sides' foot (0.30 m over the ring at the rear, 0.50 m at the front) to the floor (1.43 m wide at the rear, 1.24 m at the front); the prow two vertical faces 12.7 degrees back from the centre line; the sloped upper front band from the roof's front edge (1.00 m ahead) down 0.34 m to the prow's head; the lower front chamfer at 45 degrees back to the floor; a 6 cm chamfer across the rear roof edge | photos 02 (3.1 m long against the body's 1.16 m height), 08 (body 1.19 m, collar 0.17 m on the 2A4's wheel scale), 10 (1.64 m across the chine, the band, the chamfers), 03 (the band 0.30 m, the bottom chamfers), 07 and 09 (the prow's centre crease) |
| Elevation axis and drums | the axis 0.58 m over the ring and 0.16 m ahead of it; on each flank a bearing drum 0.40 m in radius from inside the body out to 0.875 m, a dark cover disc on it; the gun's hub (0.10 m) into the pod | photos 01, 02 (the drum's centre a third of the body's height over its floor, 51-64 % of the body's length from the rear) |
| Gun pods | turning with the guns (photos 01, 03, 05): 0.515 m wide (x 0.905-1.42 m), 0.63 m tall (0.03-0.66 m over the axis), from 0.42 m behind the axis to the nose's face 0.98 m ahead; the tail cut back top and bottom; a 0.11 m chamfer along the top outer edge, 0.05 m along the bottom; the nose a faceted pyramid from a shoulder 0.72 m ahead to a 0.24 x 0.22 m face round the bore; a hinged door on the outer face; the ItPsv 90's in the turret's paint, the ItPsv Leopard 2's in the dark weapon finish | photos 02, 09, 10 (the pods 0.55 m tall, 2.9 m across both); the tail's length the +85 degree sweep's (its lowest corner 0.17 m over the ring plane): photo 03's raised pods put about 0.25 m of pod behind the axis, photo 02's 1.8 m reads the drum's rear fairing with the pod |
| Bores | x +/-1.16 m, 0.38 m over the axis (0.96 m over the ring), index 0 the right | photos 03, 10 (the barrels 2.1-2.5 m apart); 01, 02 (the bore line 0.37-0.40 m over the drum's centre) |
| Barrels | 35 mm Oerlikon KDA: the mantlet sleeve on the nose's face, a 0.136 m jacket (painted) to 1.62 m, a clamp, the tube tapering 0.100-0.092 m to 4.05 m with a clamp at 2.75 m and a cable along its top, the v0 sleeve, the slotted brake (two side plates, two baffles, a front ring with four lugs) to the bore mouth 4.60 m ahead of the axis | photos 05, 06; the ItPsv Leopard 2's published 9.30 m with the guns forward |
| Radar | the Marconi 400 series on the rear roof, its column 0.76 m ahead of the rear face (0.86 m behind the ring) on the centre line: a base drum 0.60 m across, the rubber boot, a 0.32 m column and flange, the head with its electronics box on the right, the elevation axle, a 0.74 m dish 0.09 m deep facing forward canted up 20 degrees on a neck, its feed boss; on the axle's left end the boom to the electro-optical tracker's box; its top 2.68 m over the ring | photos 02 (0.78 m from the rear face), 04 (the dish 2.3 times the column), 03, 07, 10; valka.cz: 2,705 mm with the radar in its firing position |
| Roof | the commander's (right) and gunner's (left) sight heads at x +/-0.27 m mid-roof, windows forward under a hood; two hatches ahead of them; four lift eyes; two whips (2.1 m, antenna seat role) at the rear | photos 02, 03, 10 |
| Smoke | four 76 mm Wegmann tubes a side (eight: en.wikipedia) in a 2 x 2 block on a bracket at the rear roof corner, raised outboard and a little aft | photos 02, 07 |
| Grilles, rear | a framed louvre low on each flank's rear (0.56 x 0.54 m, a 3 x 4 lattice of diamonds; 3 x 2 at low quality); a bolted access plate and two grab handles on the rear face | photos 02, 07, 08 |

Not built: photo 08's flat antenna raised on a tripod mast over the ItPsv Leopard 2's roof (photos 02, 03 and 07 of the
same vehicle that day do not carry it; it is what the published 4.82 m measures); the Finnish roundel on the pods (no
`fi` insignia painter exists in `vehicleMarkings.ts`, a shared table); the radar turned or its dish tilted as photographed
(it faces forward, as photo 10's).

### This hull

The T-55A's hull and running gear exactly as the T-55A builds them (`profiles/t54Family.ts` `buildT55AHull`): the 6.04 m
hull, five 0.81 m road wheels a side, the 1.42 m roof and ring plane, the fender tanks and boxes, the two drums across the
stern (photo 01: five road wheels, the T-55's deck, the drums). Its turret: the adapter `t55` (0.97 m), the pods in the
turret's paint (photo 01). Triangles (geometry receipt, HIGH): 24,705 (the T-55A 26,192).

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

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/marksman/` (comparison only; never shipped). This id is photo 01; 02-10 are the turret's detail.

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
- Owed outside builder M's files: a Finnish roundel painter (`vehicleMarkings.ts`) for the pods' roundels.
