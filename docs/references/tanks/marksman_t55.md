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
  `tools/photo-reference-policy.mjs`) is owed and is the coordinator's: the as-built envelope is 8.24 m with the guns
  forward x 3.34 m (the flexible skirts) x 3.71 m (the radar's top; whips out).
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
| Gun arc | -10 / +85 degrees, 50 deg/s; the T-55A's curve dropped for the guns' own stops over the stern (at most 1.8 degrees up, yaw 138-178): [[0, -10], [137, -10], [139, -9.4], [140, -9.3], [143, -9.3], [146, -9.1], [148, -8.2], [151, -8.2], [152, -8.5], [153, -9.9], [156, -9.8], [157, -10], [160, -9.8], [164, -9.9], [166, -8.7], [167, -8.2], [170, -8.2], [171, -8.5], [172, -9.6], [175, -9.3], [177, -9.3], [178, -9.5], [179, -10], [180, -10]] | the curve measured (builder M, round 4) |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the Gepard 1A2's KDA rows, the same gun |
| Dimensions | hull 6.04 m (the T-55A's), overall 8.24 m with the guns forward (the muzzles 4.70 m ahead of the hull's centre, the drums 3.54 m behind it), width 3.34 m over the flexible skirts (3.27 m over the fenders), height 3.71 m (the radar's top 2.29 m over the 1.42 m ring) | as built; valka.cz's 2,705 mm with the radar up is not the drawn radar's (fix round 1 lowered it to photo 02's proportions) |
| Fire axes | twin, x = +/-1.24 m, 0.38 m over the drums' axis (0.58 m over the ring and 0.16 m ahead of it), the bore mouths 4.615 m ahead of the axis; index 0 the right; the ring the T-55's (0, 1.42, -0.08) | `profiles/marksmanFrame.ts` |
| Turret | the measured Marksman turret: its body's fourteen planar faces as plates, 35 mm walls and a 30 mm roof (CE +5 mm); the optics under the sights, the guns' pods as the external gun module; the gunner (+x) and the commander side by side | en.wikipedia (14.5 mm proof); valka.cz (roof 30 mm) |
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
| Body | one welded solid of fourteen planar faces: 3.07 m long (the rear face 1.62 m behind the ring, the crease 1.45 m ahead), 1.84 m across its sides, 1.52 m across the roof, the roof 1.30 m over the ring; the roof-edge chamfers 0.16 m; the front an overhanging upper plate from the roof's front edge (1.10 m ahead) down and forward to a sharp horizontal crease 0.81 m over the floor, and under it a deep V: the lower front face falling back 0.25 m to the floor and narrowing to 0.72 m across it between two corner facets cut back 38 degrees from it, from the crease's ends to the flanks' foot 0.55 m behind; the flanks vertical down to a 0.16 m chamfer all along (the floor 1.65 m across behind the corner facets); a 6 cm chamfer across the rear roof edge | photos 02 (length 2.6 times the height), 08 (body 1.19 m, collar 0.17 m on the 2A4's wheel scale), 03, 10 (height to width 0.60-0.61), 07, 09, 10 (the overhanging plate, the crease, the V) |
| Elevation axis and drums | the axis 0.58 m over the ring and 0.16 m ahead of it; on each flank a bearing drum 0.40 m in radius from inside the body out to 0.97 m, a dark cover disc on it; the gun's hub (0.10 m) into the pod | photos 01, 02 (the drum's centre a third of the body's height over its floor) |
| Gun pods | turning with the guns (photos 01, 03, 05): 0.50 m wide (x 1.00-1.50 m), 0.84 m deep (0.22 m over the bore, 0.62 m under it), from 0.42 m behind the axis to the nose's face 1.36 m ahead (1.52 m ahead of the ring): the tail cut back top and bottom, a 0.11 m chamfer along the top outer edge, 0.08 m along the bottom, the nose a pointed faceted pyramid rising from the deep housing over 0.52 m to a 0.24 m square face round the bore, a squared pyramid collar on it; with the guns level the noses stand 0.3-0.6 m proud of the body's receding lower front; a hinged door on the outer face; the ItPsv 90's in the turret's paint, the ItPsv Leopard 2's in the dark weapon finish | photos 02, 07, 09 (the pointed noses proud of the body), 10 (the bore in the pod's upper quarter, the housing below it); the tail's length the +85 degree sweep's (its lowest corner 0.17 m over the ring plane) |
| Bores | x +/-1.24 m, 0.38 m over the axis (0.96 m over the ring), index 0 the right | photos 03, 10 (the barrels 2.1-2.5 m apart); 01, 02 (the bore line 0.37-0.40 m over the drum's centre) |
| Barrels | 35 mm Oerlikon KDA, 3.06 m showing ahead of the pod: the collar (0.24 to 0.20 m square), a 0.19 m jacket (painted) to 2.10 m, a clamp, the tube tapering 0.150-0.136 m, a thin rod (32 mm) along its outer upper flank from the collar to the muzzle device with three clamp bands; the muzzle device an open frame 0.465 m long and 0.30 m across (2.2 times the tube): two square end plates, four corner bars, two ring coils inside; the bore mouth on the front plate, 4.615 m ahead of the axis | photos 02, 08 (about 3 m of barrel past the pod), 05 (the rod and its clamps), 05, 06 (the frame and the coils); the ItPsv Leopard 2's published 9.30 m with the guns forward |
| Radar | the Marconi 400 series on the rear roof, its column 0.76 m ahead of the rear face (0.86 m behind the ring) on the centre line: a base drum under a wide pleated black rubber skirt (0.72 m across at the roof, 18 pleats; 10 at low quality), a drum housing 0.42 m across on the skirt, a 0.24 m column, the head with its electronics box on the right, the elevation axle, a 0.50 m dish 0.07 m deep facing forward canted up 15 degrees on a neck, its feed boss; from the axle's left end a straight 0.50 m boom up and outward to the electro-optical tracker's box; the dish's top 0.82 m and the box's 0.99 m over the roof | photos 02 (0.78 m from the rear face), 04 (the skirt under the drum housing, the boom one dish across), 03, 07, 10; the dish 0.8 of a pod's height and 42 % of the body's (photo 02); the top about 0.8 of the turret's height over the roof (02, 04, 10) |
| Roof | the commander's (right) and gunner's (left) sight heads (0.15 x 0.18 x 0.21 m) at x +/-0.30 m mid-roof, windows forward under a hood; two hatches ahead of them; four lift eyes; two whips (2.1 m, antenna seat role) at the rear | photos 02, 03, 10 (the heads two thirds of r2's) |
| Smoke | four 76 mm Wegmann tubes a side (eight: en.wikipedia) in a 2 x 2 block on a bracket at the rear roof corner, raised outboard and a little forward (round 4: never astern, tools/vehicle-controls-inventory.mjs) | photos 02, 07 |
| Grilles, rear | a framed louvre low on each flank's rear (0.56 x 0.54 m, a 3 x 4 lattice of diamonds; 3 x 2 at low quality); a bolted access plate and two grab handles on the rear face | photos 02, 07, 08 |

Not built: photo 08's flat antenna raised on a tripod mast over the ItPsv Leopard 2's roof (photos 02, 03 and 07 of the
same vehicle that day do not carry it; it is what the published 4.82 m measures); the Finnish roundel on the pods (no
`fi` insignia painter exists in `vehicleMarkings.ts`, a shared table); the radar turned or its dish tilted as photographed
(it faces forward, as photo 10's).

### This hull

The T-55A's hull and running gear as the T-55A builds them (`profiles/t54Family.ts` `buildT55AHull`): the 6.04 m
hull, five 0.81 m road wheels a side, the 1.42 m roof and ring plane, the fender tanks and boxes, the two drums across the
stern (photo 01: five road wheels, the T-55's deck, the drums), with the photograph's two hull options (fix round 1, both
off by default, the T-55A and the Type 59 byte-identical): `flexibleSkirts`, six pale panels a side hung from the fender
shelf's lip to 0.60 m (the wheels' top third) over the top track run, each flaring a little outboard and overlapping the
next, and a drape over each front mudguard's outer edge; and `smoothMudguards`, the front scoops without their pressed
ribs. Its turret: the adapter `t55` (0.97 m), the pods in the turret's paint (photo 01). Triangles (geometry receipt,
HIGH): 24,715 (the T-55A 26,192).

Round 4 (2026-11-04; a blind A/B judge preferred r2, c42fa5565d, over r3, b22cba2b36, in all 14 pairs: the lengthened turret
was the wrong call): back to r2's proportions, the body 3.07 m long (r3 3.82 m), r2's elevation axis (0.16 m ahead of the
ring) and pod tail, the 9.30 m from the barrels again (3.06 m showing past the pod; photos 02, 08: about 3 m); kept from
r3: the T-55's flexible skirts and smooth front mudguards, the ribbed black rubber boot (now under a drum housing, photo
04), the rod and clamp bands on each barrel, the open muzzle frame round two rings (now 0.30 m across, 2.2 times the
tube), the thicker barrels, the smaller radar (its dish's top 0.82 m and the arm's 0.99 m over the roof, about 0.8 of the
turret's height), the smaller sight heads. Fixed on r2: the body 0.24 m wider (height to width 0.63; photos 03, 10: about
0.60); the front hard, an overhanging upper plate to a sharp horizontal crease over a deep V lower front (07, 09, 10);
the pod noses pointed and faceted and 0.38 m further forward, standing 0.3-0.6 m proud of the receding lower front with
the guns level, the bore in the pod's upper quarter (02, 07, 09, 10). Photo 08's A-frame antenna stays unbuilt (no other
photograph shows it).

Receipts after round 4 (2026-11-04, worktree `~/cot-lanes/twin-aa-269`, uncommitted over b22cba2b36): the fixture
`src/vehicles/profiles/marksman.selftest.mjs` PASS (both ids, both qualities: the frame's fourteen faces planar, convex and
closed; the rings, axis, bores and muzzle plane; the envelope; the guns 24 mm from the turret's stock through -10 to +85
degrees, the hubs excepted; 26 mm (ItPsv 90) and 29 mm (ItPsv Leopard 2) from the hull at every 5 degrees of yaw and pitch
from the published stops, re-measured per degree at the sweep's 26 mm with `~/cot-lanes/twin-aa-269-evidence/M/scripts/hullfloors.mjs`
and fitted by `tools/gun-depression-sweep.mjs --envelope`: at most 1.8 degrees (ItPsv 90, yaw 138-178) and 2 degrees (ItPsv
Leopard 2, yaw 138-180) over the stern); the accessory contact probe 0 floating / 0 clipping; `tools/roof-pocket-census.mjs`
none (a deeper flank chamfer under the V roofed a slot beside the pods: the V is cut by corner facets over vertical
flanks instead); `tools/gun-junction-census.mjs` CLOSED at rest, +85 and -10; `tools/vehicle-controls-inventory.mjs --check
--ids=marksman_t55,itpsv_leopard2` past its smoke-direction check (the eight tubes now forward of lateral; it stops on the
generated table's staleness, the coordinator's regeneration); `internalPlacement.selftest.mjs` clean on both ids (the fleet run still fails on lvkv9040's own module overlaps); the geometry digest
of t55a, type59 and the seven leopard2a4Family ids byte-identical to the first round's baseline
(`~/cot-lanes/twin-aa-269-evidence/M/digest-{before,r4g}.json`); `npm run -s typecheck` clean (TypeScript 7, no unused
symbols, oxlint).
Renders: `~/cot-lanes/twin-aa-269-evidence/M/r1/` (first build), `r2/` (c42fa5565d), `r3/` (b22cba2b36) and `r4/` (round 4).


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
