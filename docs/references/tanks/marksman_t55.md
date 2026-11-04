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
| Gun arc | -10 / +85 degrees, 50 deg/s; the T-55A's curve dropped for the guns' own stops over the stern (at most 0.7 degrees up, yaw 127-172): [[0, -10], [126, -10], [127, -9.6], [130, -9.6], [131, -10], [148, -10], [150, -9.3], [153, -9.4], [154, -10], [166, -10], [167, -9.5], [170, -9.3], [171, -9.3], [172, -9.5], [173, -10], [180, -10]] | en.wikipedia; the curve measured (builder M, fix round 1) |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the Gepard 1A2's KDA rows, the same gun |
| Dimensions | hull 6.04 m (the T-55A's), overall 8.24 m with the guns forward (the muzzles 4.70 m ahead of the hull's centre, the drums 3.54 m behind it), width 3.34 m over the flexible skirts (3.27 m over the fenders), height 3.71 m (the radar's top 2.29 m over the 1.42 m ring) | as built; valka.cz's 2,705 mm with the radar up is not the drawn radar's (fix round 1 lowered it to photo 02's proportions) |
| Fire axes | twin, x = +/-1.16 m, 0.38 m over the drums' axis (0.58 m over the ring and 0.72 m ahead of it), the bore mouths 4.055 m ahead of the axis; index 0 the right; the ring the T-55's (0, 1.42, -0.08) | `profiles/marksmanFrame.ts` |
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
| Body | one welded solid of fifteen planar faces: 3.82 m long (rear face 1.62 m behind the ring, the prow 2.20 m ahead), 1.60 m across its sides, 1.32 m across the roof, the roof 1.30 m over the ring; the roof-edge chamfers 0.14 m; the lower chamfer from the sides' foot (0.30 m over the ring at the rear, 0.50 m at the front) to the floor (1.43 m wide at the rear, 1.24 m at the front); the prow two vertical faces 12.7 degrees back from the centre line; the sloped upper front band from the roof's front edge (1.80 m ahead) down 0.34 m to the prow's head; the lower front chamfer at 45 degrees back to the floor; a 6 cm chamfer across the rear roof edge | photos 08 (body 1.19 m, collar 0.17 m on the 2A4's wheel scale; its rear between road wheels 5 and 6), 10 (1.64 m across the chine, the band, the chamfers), 03 (the band 0.30 m, the bottom chamfers), 07 and 09 (the prow's centre crease); fix round 1: 0.80 m longer at the front (photos 01, 07, 08: the turret over the deck ahead of the engine) |
| Elevation axis and drums | the axis 0.58 m over the ring and 0.72 m ahead of it; on each flank a bearing drum 0.40 m in radius from inside the body out to 0.875 m, a dark cover disc on it; the gun's hub (0.10 m) into the pod | photos 01, 02 (the drum's centre a third of the body's height over its floor; photo 02: 64 % of the body's length from its rear) |
| Gun pods | turning with the guns (photos 01, 03, 05): 0.515 m wide (x 0.905-1.42 m), 0.86 m deep (0.24 m over the bore, 0.62 m under it), from 0.42 m behind the axis to the nose's face 1.86 m ahead (2.58 m ahead of the ring); the tail cut back top and bottom; a 0.11 m chamfer along the top outer edge, 0.08 m along the bottom; the nose a faceted pyramid rising from the deep housing to a 0.26 m square face round the bore; a hinged door on the outer face; the ItPsv 90's in the turret's paint, the ItPsv Leopard 2's in the dark weapon finish | fix round 1 (the blind critic): photo 10 (the bore in the pod's top third, the housing 0.77 of the body's height), photos 07, 08 (the near pod's front over the hull's front corner and the front idler), 01 (at the T-55's glacis edge); the tail's length the +85 degree sweep's (its lowest corner 0.17 m over the ring plane) |
| Bores | x +/-1.16 m, 0.38 m over the axis (0.96 m over the ring), index 0 the right | photos 03, 10 (the barrels 2.1-2.5 m apart); 01, 02 (the bore line 0.37-0.40 m over the drum's centre) |
| Barrels | 35 mm Oerlikon KDA, 2.2 m showing ahead of the pod: a squared pyramid collar on the face (0.26 to 0.21 m square), a 0.19 m jacket (painted) to 2.55 m, a clamp, the tube tapering 0.150-0.136 m, a thin line (32 mm) along its outer upper flank from the collar to the muzzle device, clamped to it twice; the muzzle device an open cage 0.455 m long (21 %): two 0.21 m square end plates, four corner bars, two ring coils inside; the bore mouth on the front plate, 4.055 m ahead of the axis | fix round 1 (the blind critic): photos 02, 05, 06 (the line and its clamps, the cage, the coils, the end plates), 02, 08 (the barrels' thickness against the pod), 09, 10 (the squared collar); the ItPsv Leopard 2's published 9.30 m with the guns forward |
| Radar | the Marconi 400 series on the rear roof, its column 0.76 m ahead of the rear face (0.86 m behind the ring) on the centre line: a base drum under a wide pleated black rubber skirt (0.72 m across at the roof, 18 pleats; 10 at low quality), a 0.24 m column, the head with its electronics box on the right, the elevation axle, a 0.50 m dish 0.07 m deep facing forward canted up 15 degrees on a neck, its feed boss; from the axle's left end a straight 0.50 m boom up and outward to the electro-optical tracker's box; its top 2.29 m over the ring (0.99 m over the roof) | photos 02 (0.78 m from the rear face), 03, 04 (the skirt, the boom one dish across), 07, 10; fix round 1 (the blind critic): the dish 0.8 of a pod's height and 42 % of the body's (photo 02), 26 % of its width (photo 10), the top 35 % lower |
| Roof | the commander's (right) and gunner's (left) sight heads (0.15 x 0.18 x 0.21 m) at x +/-0.25 m, 0.30 m ahead of the ring, windows forward under a hood; two hatches ahead of them; four lift eyes; two whips (2.1 m, antenna seat role) at the rear | photos 02, 03, 10; fix round 1: the heads two thirds the size (photo 02) |
| Smoke | four 76 mm Wegmann tubes a side (eight: en.wikipedia) in a 2 x 2 block on a bracket at the rear roof corner, raised outboard and a little aft | photos 02, 07 |
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
HIGH): 24,473 (the T-55A 26,192).

Fix round 1 (2026-11-03; the coordinator's blind photo critic: shared turret 6/10, marksman_t55 5/10, itpsv_leopard2
6/10; the build committed as c42fa5565d): the turret 0.80 m longer at the front and the pods to 2.58 m ahead of the ring
(their fronts over the T-55's glacis edge and over the Leopard's front idler, the turret covering the deck ahead of the
engine on both hulls; the rear face where it was), the drums' axis 0.56 m further forward; the pods 0.86 m deep with the
bore in their top third and a squared pyramid collar; the barrels thicker, with the thin line clamped along each and the
muzzle device an open cage of two end plates and four bars round two ring coils (21 % of the barrel showing), the
barrels shorter ahead of the pods so the ItPsv Leopard 2 keeps its published 9.30 m; the radar's dish 0.50 m across (0.74 m before),
its top 0.39 m lower, a wide pleated black rubber skirt at its base and a straight boom up and outward to the tracker's
box; the sight heads two thirds the size. Kept, as the critic found them right: the drums, the slab-sided body with its
faceted lower front and ring neck, the grilles, the radar's place, both hulls and the turret's height on each.

Receipts after fix round 1 (2026-11-03, worktree `~/cot-lanes/twin-aa-269`, uncommitted over c42fa5565d): the fixture
`src/vehicles/profiles/marksman.selftest.mjs` PASS (both ids, both qualities: the frame's fifteen faces planar, convex and
closed; the rings, axis, bores and muzzle plane; the envelope; the guns 24 mm from the turret's stock through -10 to +85
degrees, the hubs excepted; 30 mm (ItPsv 90) and 27 mm (ItPsv Leopard 2) from the hull at every 5 degrees of yaw and pitch
from the published stops); the accessory contact probe 0 floating / 0 clipping; `tools/roof-pocket-census.mjs` none; `tools/gun-junction-census.mjs` CLOSED at rest, +85 and -10 (the cages' openings are muzzle-device runs); the stern depression curves re-measured per degree at the sweep's 26 mm (`~/cot-lanes/twin-aa-269-evidence/M/scripts/hullfloors.mjs`, gunHullClearance's probe) and fitted by `tools/gun-depression-sweep.mjs --envelope`; `internalPlacement.selftest.mjs` clean on both ids (fix round 1: the turret's magazines and belt feeds as turret modules inside the body, the base hull's main-gun rack left out, the crew boxes from the floor up, the copied power pack split into engine and transmission; the fleet run still fails on lvkv9040's and pza_loara's own module overlaps); the geometry digest (`.qa-dev/geodigest2.mjs`) of t55a, type59 and the seven leopard2a4Family ids byte-identical to the first round's baseline (`~/cot-lanes/twin-aa-269-evidence/M/digest-{before,fix1}.json`; the T-55 hull's two new options off); `npm run -s typecheck` clean (TypeScript 7, no unused symbols, oxlint); recoilRig, type59Overhaul, cnGunMantlet and afvBalance PASS. The first round's receipts (c42fa5565d) held the same checks on the shorter turret.
Renders: `~/cot-lanes/twin-aa-269-evidence/M/r1/` (first build), `r2/` (c42fa5565d) and `r3/` (fix round 1).

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
