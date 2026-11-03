# Flakpanzer Gepard 1A2 (`gepard_1a2`), run packet

## Current status

- IDs and display names: `gepard_1a2`, "Flakpanzer Gepard 1A2" (`src/vehicles/tankLabels.ts`); fleet group `gepard`.
- Updated: 2026-11-02 (release 268, builder G over the registrar R0's registration).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: MEASURED PHOTOGRAPHIC BUILD (builder G). The shared Leopard 1 hull and running gear
  (`profiles/leopard1Hull.ts`, unchanged, called with `grouserRack`, `deckTools` and `sideTools` off) under the Gepard's
  welded turret, its guns, radars and dischargers (`profiles/gepard.ts`), every spatial datum the spec reads drawn from
  one frame (`profiles/gepardFrame.ts`); the build section below has the numbers and the photographs they came from.
- Qualification status: native fixture `src/vehicles/profiles/gepard.selftest.mjs` (both qualities); photographic
  qualification (a dated packet under `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`) is
  owed and is the coordinator's: the as-built envelope is 7.71 m x 3.42 m (the hull's front mudguards) x 4.22 m (the
  search radar raised; whips out).
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action (coordinator): register `gepard.selftest.mjs`, then the generated tables for this id: combat
  anatomy (`npm run tank:anatomy:update` and `check`), marking seats, interior fill, presentation anchors, auxiliary
  inventory, tank assets; the photographic packet; and the marking anchor (below).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 268 twin-cannon air-defence round.
- Owned files (builder G after the registrar): `src/vehicles/gepardSpecs.ts`, `src/vehicles/profiles/gepard.ts`, this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration,
  procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, markings anchors,
  roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, audio engine family, the tech
  tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the coordinator's baseline).

## Configuration

The Gepard 1A2 in Bundeswehr NATO three-tone: Panzermuseum Munster (03-11; 05 is the B2L data plate), the
B2L (12, number 422 on the turret), Brussels (13) and Brasschaat (14); 01-02 show the covered guns and radar. Leopard 1
hull, the turret with the folding search radar at the rear and the tracking radar at the front, a 35 mm KDA on each
side outboard of the turret (03, 04 and 07: the muzzle brakes and the velocity-measuring heads).

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (driver, gunner, commander) | de.wikipedia "Flugabwehrkanonenpanzer Gepard" |
| Combat weight | ~47.5 t (15.5 t turret, 32 t chassis) | de.wikipedia |
| Length | 7.68 m overall (7.76 m in the 1A2 section) | de.wikipedia |
| Width | 3.27 m (3.28 m in the 1A2 section; en.wikipedia: 3.71 m) | de.wikipedia; en.wikipedia |
| Height | 3.29 m search radar folded, 4.22 m raised (the brief's 4.03 m is not supported) | de.wikipedia |
| Guns | two 35 mm Oerlikon KDA L/90, 550 rpm each; 320 AA + 20 AP rounds a gun (640 + 40) | de.wikipedia; en.wikipedia |
| Gun arc | -10 to +85 degrees | de.wikipedia |
| Engine | MTU MB 838 CaM-500, 610 kW (830 PS), ~65 km/h, 550 km | de.wikipedia; en.wikipedia |
| 1A2 | the 1996-2000 service-life extension (NDV): 147 Bundeswehr vehicles, 60 Dutch; FAPDS ammunition | de.wikipedia; en.wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are builder G's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; Germany's Leopard 1 row after the MBT-70 (lane 5): a direct child of the Leopard 1A5 at V would run its connector through the MBT-70, and lanes 4 and 8 cross the Lynx's and the A4 V's connectors |
| Class / role / status / era | spaa / scout (recon) / service / modern | the 1A2 is a 1996-2000 upgrade |
| HP, engine, weight | 2,500 / 830 hp / 47.5 t | |
| Speed, reverse, traverse | 65 / 25 km/h / 38 and 72 deg/s authored (42.6 and 79.2 after recon) | de.wikipedia; the Leopard 1A5's reverse |
| Gun arc | -10 / +85 degrees, 50 deg/s; the Leopard 1A5's curve dropped; builder G's measured stops over the engine deck (from yaw 134, at most 2 degrees since fix round 1 lowered the guns: the v0 heads over the outlets' and exhaust's covers): `[[0,-10],[134,-10],[136,-9.3],[139,-8.4],[141,-8],[143,-8],[146,-8.4],[173,-8.1],[174,-8.1],[180,-8.5]]` | de.wikipedia; `.qa-dev/gepard/sweepfast.mjs` (the sweep's probe and keep) fitted by `tools/gun-depression-sweep.mjs --envelope` |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; FAPDS-T (HE channel) 56 dmg, 1,440 m/s, 640 rounds; 0.35 s | the Terminator 2's 30 mm rows scaled by calibre (x 35/30); the published 40 + 640 load |
| SAM | none | the 1A2 carries no missiles |
| Fire control | 0.25 accuracy, 1.05 s aim (0.99 after recon) | |
| Fire axes | twin, gun-local x = +/-0.96 m, y = +0.17 m over the elevation axis, muzzle heads 4.05 m ahead of it | the build (profiles/gepardFrame.ts) |
| Turret pivot | (0, 1.60, 0.50): the Leopard 1 hull's turret station on the 1.58 m deck | profiles/leopard1Hull.ts |
| Gun pivot | (0, 0.66, -0.40) turret-local: the centre of the large elevation bearing on each flank (photo 08) | the build |
| Paint | spec coat: the Leopard 1A5's Bundeswehr NATO three-tone; stock: Germany's Factory coat `service_leo2a6m` (as the 1A5) | no new paint |
| Marking | turret left anchor (the Leopard 1A5's), Bundeswehr cross, number 422 (photo 12) | |
| Wheels | the Leopard 1A5's standard (`WHEEL_STANDARD_EXCEPTIONS`, donor leo2a4), not Germany's IFV Lynx wheel | |
| View / camouflage | 450 m, 0.225 / 0.195 | |

## Build (builder G, 268)

Frame: hull metres, +z forward; the turret is drawn turret-local (ring plane y 0 at 1.60 m, 0.50 m ahead of the hull
origin), each gun gun-local about its elevation axis. Every number below is a constant in `profiles/gepardFrame.ts`.

| Part | Numbers | From |
| --- | --- | --- |
| Hull and running gear | the fleet's Leopard 1 (7 road wheels on 0.74 m, 3.25 m over the tracks, 1.58 m deck), with the shared hull's new `sideSkirts: false` (fix round 1): the upper track run and the four return rollers open under the fender, as photos 01, 09, 11 and 14 show | `profiles/leopard1Hull.ts` |
| Turret length / height | 3.16 m (front face 1.30 m ahead of the ring, rear face 1.86 m behind); roof 1.08 m over the ring (2.68 m) | photo 01's side elevation scaled on the wheel span (turret 785 px of 4.44 m = 1095 px; roof 2.68 m), photo 08/11 |
| Upper body | 1.44 m wide, slab sides, 0.10 m front corner chamfers, the front roof edge chamfered | photo 10's front (the face about 1.4 m between its corner edges, the covers right beside it) |
| Rear section | 2.48 m wide, from 1.10 m behind the ring to the rear face, closing the gun bays behind the covers | photos 08, 09 (the rear box flush with the covers' outer faces) |
| Cheeks | 2.44 m wide, 0.22 m tall under the bays' front (top 0.33 m over the ring since fix round 1, 6 cm under the lowered covers at full depression), the chin raked; the dischargers' shelf | photos 10, 11, 12 |
| Floor | 0.11 m over the ring (1.71 m), so the outer corners sweep the hull's lift eyes (top 1.68 m) | the hull build |
| Elevation bearing | axis 0.60 m over the ring (fix round 1; 0.66 before), 0.40 m behind it; the black disc 0.34 m in radius on each flank, showing under the cover | photo 08 read through its perspective (axis 0.54 m and bores 0.71 m over the turret's floor line, the disc's centre under the cover, 58 % back along it) |
| Gun covers | 0.46 m wide (x 0.78-1.24), 0.46 m tall, 0.52 m behind to 1.10 m ahead of the axis, octagonal section, the nose tapering onto the barrel, two doors; their tops 0.14 m under the roof since fix round 1 (flush before) | photos 08, 09, 12 |
| Bores | x +/-0.96 m, 0.15 m over the axis (2.35 m at rest) | photo 10 (the bores at 1.27 x the face's half width); photo 08 (0.71 m over the turret's floor line) |
| Barrels | 35 mm KDA L/90: 3.15 m barrel, 3.71 m with the v0 head (de.wikipedia); jacket, clamp, tapered tube; the v0 head (fix round 1): a clamp collar, the muzzle brake and its flange (the bore mouth, 3.74 m ahead of the axis), a round rod and two tapered blades reaching 0.31 m past it to 4.05 m, a wire loop: 7.71 m overall with the guns forward (published 7.68 / 7.76 m) | de.wikipedia; photos 03, 04 |
| Tracking radar | fix round 1: one bulbous nose the turret's full height: a lateral drum 0.56 m across and 0.76 m long between two squared yoke cheeks, a forward dome 0.64 m across on its rim (its face 0.64 m proud of the front plate), on a rounded chin tub 0.80-0.88 m wide from the turret's floor up under the head, its front 0.54 m proud | photos 06, 08, 10, 12 |
| Search radar | MPDR 12 raised (fix round 1): a squat drum 0.60 m across and 0.42 m tall on the rear roof (1.48 m behind the ring) with its turntable, a short elbow into the reflector's back, a deep doubly curved reflector 1.24 m wide, 1.04 m tall and 0.32 m deep, canted back 22 degrees, concave forward, its top at the published 4.22 m and its lower edge 0.58 m over the roof; the feed horn before its lower half on a 0.13 m swan-neck waveguide from the drum's front | de.wikipedia (4.22 m raised); photos 06, 08, 09 |
| Sights and hatches | two sight heads at the roof's front either side of the radar (commander right, gunner left), two round hatches behind them, four lift eyes | photos 10, 12 |
| Dischargers | four 76 mm Wegmann tubes a side on a bracket on the cheek's top, raised outboard and forward, 4.5 cm outboard of the barrels' and noses' sweep | de.wikipedia (2 x 4); photos 08, 11, 12 |
| Rear kit | two stowage boxes on the rear face, a box on each flank, two radio whips (2.2 m, antenna seat role) | photos 08, 09 |
| Hull kit (this build only) | four stowage bins a side on the sloped side plates (outer face over the fender's edge, lid 3 cm under the deck's edge since fix round 1: 1.52 m in photo 01), four grouser blocks on the glacis, the APU's intake grille on the deck's front left | photos 01, 09, 11, 14; 06, 10, 12; the APU replaces the Leopard 1's front-left ammunition |

Receipts run by builder G (2026-11-02, worktree `~/cot-lanes/twin-aa-268`, uncommitted over 6cb68f5947): the fixture
`profiles/gepard.selftest.mjs` PASS; `GUN_CLEARANCE_IDS=gepard_1a2 nationalGunClearance.selftest.mjs` PASS (26.07 mm worst,
at yaw -143; the bare -10 degrees meets the hull, the negative control); the accessory contact probe 0 floating / 0
clipping; `tools/roof-pocket-census.mjs` none; the geometry digest (`.qa-dev/geodigest2.mjs`) of leo1a5, leo1a2a1,
leo1a3dk, leo1a5dk and leo1a5dk1 byte-identical to the coordinator's baseline; the selftests naming the id or the
Leopard 1 ids (afvBalance, vehicleAudioProfiles, ammunitionFlow, camoCatalogProductionIndices, nationWheelSets,
vehicleFacets, leopard1A2A1Source, leopard1A5Source, leopardStructuralRepairs, denmark, smokeLauncherFleet, camoPolicy,
roofHoldFire, tankIdAliases, techTree) PASS; typecheck clean in these files.

The German 1A2 is built: the Belgian (13, 14) and Dutch radars are not. The covered guns of 01-02 are not drawn.
Clearances the fixture holds: both guns 15 mm or more from every turret part through -10 to +85 degrees (the bearing
hubs turn in the body's flank about their own axis and are left out); the cover tails swing back 0.621 m from the axis,
7.9 cm short of the bays' rear wall; the cover tails' lowest point at +85 degrees is 1.69 m, 0.11 m over the deck.

Fix round 1 (2026-11-03; critics A and B, both 7.0, `~/cot-lanes/twin-aa-268-evidence/critic1/`): the search radar
rebuilt (drum, elbow, deep canted shell, swan-neck feed); the tracking radar as one bulbous nose (chin tub, yoke cheeks,
a larger dome); the side skirts off (`sideSkirts`), the return run and rollers open; the bins to the deck line; the gun
plant 6 cm lower with the covers' tops 0.14 m under the roof; the v0 heads' prongs on the barrels. Rejected: raising the
hull 0.12-0.15 m on its running gear (photo 01, scaled on its 0.69 m road wheels, puts the deck at 1.61 m against the
build's 1.58 m: the critics read the round-1 bins' lids, 0.10 m under the deck line, as the hull's top), and a lower rear
roof (photos 01, 08, 09 show the rear section's roof level with the front's; the critic's photo shows the raised guns'
covers and the rear boxes in front of it). Receipts after the fix (2026-11-03): the fixture PASS; `nationalGunClearance`
for gepard_1a2 PASS (27.73 mm worst, at yaw -173; the bare -10 degrees meets the hull); contact 0 / 0; roof pockets none;
typecheck clean; leo1a5, leo1a2a1, leo1a3dk, leo1a5dk and leo1a5dk1 byte-identical to the baseline under the new
`sideSkirts` option (default on); the 15 selftests naming the id or the Leopard 1 ids PASS.

## Photographic references

Saved under `~/cot-lanes/twin-aa-268-evidence/photos/gepard/` (comparison only; never shipped).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [Flakpanzer Gepard SPAAG.JPG](https://commons.wikimedia.org/wiki/File:Flakpanzer_Gepard_SPAAG.JPG) | Alf van Beem | CC0 | 2010-05-05 |
| 02 | [Flakpanzer Gepard (9394460358).jpg](https://commons.wikimedia.org/wiki/File:Flakpanzer_Gepard_(9394460358).jpg) | Stéphane Gaudry from Olne | CC BY 2.0 | 2013-07-28 |
| 03 | [Panzermuseum Munster 2010 0843.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0843.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 04 | [Panzermuseum Munster 2010 0844.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0844.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 05 | [Panzermuseum Munster 2010 0850.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0850.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 06 | [Panzermuseum Munster 2010 0851.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0851.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 07 | [Panzermuseum Munster 2010 0856.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0856.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 08 | [Panzermuseum Munster 2010 0857.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0857.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 09 | [Panzermuseum Munster 2010 0859.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0859.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 10 | [Munster 2022 - Panzermuseum - Flakpanzer Gepard - by-RaBoe 088.jpg](https://commons.wikimedia.org/wiki/File:Munster_2022_-_Panzermuseum_-_Flakpanzer_Gepard_-_by-RaBoe_088.jpg) | Raboe001 | CC BY-SA 3.0 | 2022-11-17 |
| 11 | [Munster 2022 - Panzermuseum - Flakpanzer Gepard - by-RaBoe 091.jpg](https://commons.wikimedia.org/wiki/File:Munster_2022_-_Panzermuseum_-_Flakpanzer_Gepard_-_by-RaBoe_091.jpg) | Raboe001 | CC BY-SA 3.0 | 2022-11-17 |
| 12 | [Flugabwehrpanzer Gepard B2L (51438431466).jpg](https://commons.wikimedia.org/wiki/File:Flugabwehrpanzer_Gepard_B2L_(51438431466).jpg) | Thomas Vogt from Paderborn | CC BY 2.0 | 2021-07-31 |
| 13 | [Bruxelles Musée Royal de l'Armée Panzer 01.jpg](https://commons.wikimedia.org/wiki/File:Bruxelles_Mus%C3%A9e_Royal_de_l%27Arm%C3%A9e_Panzer_01.jpg) | Zairon | CC BY-SA 4.0 | 2018-12-30 |
| 14 | [Flakpanzer Gepard Barbarian, Gunfire Artilleriemuseum Brasschaat foto 1.jpg](https://commons.wikimedia.org/wiki/File:Flakpanzer_Gepard_Barbarian,_Gunfire_Artilleriemuseum_Brasschaat_foto_1.jpg) | Alf van Beem | Public domain | 2017-04-22 |

## Construction work order (builder G)

- DONE: the measured build in `src/vehicles/profiles/gepard.ts` (and `profiles/gepardFrame.ts`); `src/vehicles/gepardSpecs.ts`'s
  turret and gun pivots, fire axes (`gun.muzzles`), turret plates, turret-local modules and crew boxes read the same
  frame (no launchers: `gun.launcherMuzzles` stays absent).
- DONE: the guns against the turret through the whole arc (the fixture) and against the hull at every yaw: the floors
  from the sweep's own probe and keep (`.qa-dev/gepard/sweepfast.mjs`: both sides of each degree, a 0.5-degree grid
  bisected to 0.05, every 5 degrees up to +85 at every 2 degrees of yaw: no conflict above level), the curve fitted by
  `tools/gun-depression-sweep.mjs --envelope`, held at every degree by `nationalGunClearance.selftest.mjs`. The full
  `tools/gun-depression-sweep.mjs --ids=gepard_1a2 --no-suit` (every pitch at every degree, about 35,000 poses of 124k
  samples) did not finish on the loaded machine (load ~200: under 2 CPU-minutes in 22 minutes); rerun it on a quiet one.
- OWED (coordinator): the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`),
  marking seats, interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet
  registration.
