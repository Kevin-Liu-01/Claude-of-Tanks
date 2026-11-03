# Pantsir-S1 (tracked) (`pantsir_s1`), run packet

## Current status

- IDs and display names: `pantsir_s1`, "Pantsir-S1 (tracked)" (`src/vehicles/tankLabels.ts`); fleet group `gm352AirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0; measured build, builder R).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: BUILT (builder R, 2026-11-02). The registrar's BMP-3 placeholder is gone: the measured GM-352
  chassis (`src/vehicles/profiles/gm352Chassis.ts`) with its GM-352M1E option (the raised, grilled cooling boxes over the
  stern and the rear-view camera's hood) under the Pantsir-S1 combat module (`src/vehicles/profiles/pantsirS1.ts`);
  every datum the spec reads lives in `src/vehicles/profiles/gm352Layout.ts`, read by the builders and by
  `src/vehicles/gm352AirDefenseSpecs.ts`.
- Qualification status: physical receipts in the build section below. Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is still owed:
  the as-built box is 8.03 x 3.25 x 4.10 m to the search radar's panel, 4.24 m to the whips' tips (hull 7.93 m; the
  heater's exhaust stub stands 0.09 m proud of the stern plate).
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action (coordinator): register `src/vehicles/profiles/gm352AirDefense.selftest.mjs`, then the generated
  tables for this id: the combat-anatomy update (`npm run tank:anatomy:update` and `check`), marking seats, interior
  fill, presentation anchors, auxiliary inventory and tank assets, and the photographic packet.

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 268 twin-cannon air-defence round.
- Owned files (builder R): `src/vehicles/gm352AirDefenseSpecs.ts`, `src/vehicles/profiles/gm352AirDefense.ts` and its new
  neighbours `gm352Layout.ts`, `gm352Chassis.ts`, `tunguskaM.ts`, `pantsirS1.ts`, `gm352AirDefense.selftest.mjs`, this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration,
  procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, markings anchors,
  roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, audio engine family, the tech
  tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the coordinator's baseline).

## Configuration

The 96K6 Pantsir-S1 combat module on the tracked GM-352M1E chassis, the Engineering Technologies 2012 vehicle
(01-15) and MAKS 2013 (16): the front tracking radar's round dome, the rear flat search radar panel, two six-tube 57E6
banks and the two 2A38M guns, plain Russian green.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 | brief; Wikipedia "Pantsir missile system" |
| Length | ~7.8 m (the brief's approximate figure; the shared GM-352 hull builds 7.93 m, `dims` say so) | brief |
| Weight | not published for the GM-352M1E option; 35 t estimated (the GM-352 family's 34-35 t) | estimate |
| Height | not published; 4.10 m estimated to the search radar | estimate from the 2012 photographs |
| Guns | two 2A38M twin-barrel 30 mm, 2,500 rpm a gun, 700 rounds a gun (1,400) | Wikipedia |
| Missiles | twelve 57E6 in two six-tube banks | Wikipedia; brief |
| Envelope | -5 to +85 degrees (the system's vertical engagement envelope) | Wikipedia |
| Status | listed by Wikipedia as an option under prototypes (first shown 2005 MILEX, Engineering Technologies 2012) | Wikipedia; search |

## Registration numbers (combat rows are the registrar's; spatial datums are the measured build's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion; after the Tunguska-M on the Russia line (lane 13) |
| Class / role / status / era | spaa / scout (recon) / prototype / modern | the tracked option never entered service |
| HP, engine, weight | 2,450 / 780 hp / 35 t | the GM-352 family estimate |
| Speed, reverse, traverse | 65 / 18 km/h / 39 and 72 deg/s authored (43.7 and 79.2 after recon) | |
| Gun arc | -5 / +85 degrees, 50 deg/s | Wikipedia's system envelope |
| 30 mm | 3UBR8 APDS 122/110/98 mm, 50 dmg, 1,120 m/s, 700 rounds; 3UOF8 HE-I 46 dmg, 700 rounds; 0.28 s | the BMPT T-90's twin 2A42 rows (tier VI) |
| SAM | 57E6: 380 dmg, 25 mm, 1,300 m/s, 12 rounds, 12 tubes, 3.0 s, `tow-launch` | the Linebacker's Stinger handling; the 57E6's peak speed |
| Fire control | 0.25 accuracy, 1.05 s aim (0.99 after recon) | |
| Fire axes | twin, x = +/-0.745 m in the gun frame: each 2A38M's inner bore (barrel groups 0 and 1) | builder R, gm352Layout.ts PANTSIR |
| Paint | stock `national_ru`, spec coat the same | the photographs' solid green |
| Marking | hull left anchor, number 421 | |
| View / camouflage | 455 m, 0.215 / 0.185 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-268-evidence/photos/pantsir/` (comparison only; never shipped).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [96K6 Pantsir-S1 tracked at Engineering Technologies 2012.jpg](https://commons.wikimedia.org/wiki/File:96K6_Pantsir-S1_tracked_at_Engineering_Technologies_2012.jpg) | Mike1979 Russia | CC BY-SA 3.0 | 2012-06-28 |
| 02 | [96K6 Pantsir-S1 tracked at Engineering Technologies 2012 Front.jpg](https://commons.wikimedia.org/wiki/File:96K6_Pantsir-S1_tracked_at_Engineering_Technologies_2012_Front.jpg) | Mike1979 Russia | CC BY-SA 3.0 | 2012-06-28 |
| 03 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -1.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-1.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 04 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -2.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-2.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 05 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -3.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-3.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 06 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -4.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-4.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 07 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -5.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-5.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 08 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -6.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-6.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-29 |
| 09 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -7.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-7.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 10 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -8.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-8.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 11 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -9.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-9.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-29 |
| 12 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -10.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-10.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-29 |
| 13 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -12.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-12.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-29 |
| 14 | [Pantsir-S1 (tracked) - Engineering Technologies 2012 -14.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_(tracked)_-_Engineering_Technologies_2012_-14.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-29 |
| 15 | [Pantsir-S1 SAM at Engineering Technologies 2012.jpg](https://commons.wikimedia.org/wiki/File:Pantsir-S1_SAM_at_Engineering_Technologies_2012.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2012-06-27 |
| 16 | [Panzir on tracks MAKS Airshow 2013.JPG](https://commons.wikimedia.org/wiki/File:Panzir_on_tracks_MAKS_Airshow_2013.JPG) | Hornet Driver | CC BY-SA 3.0 | 2013-08-01 |

## Measured build (builder R, 2026-11-02)

Datums: `src/vehicles/profiles/gm352Layout.ts` (hull frame: y 0 the ground, +z forward, +x the vehicle's left). The
chassis is the Tunguska's GM-352 (one builder, `gm352Chassis.ts`), with the GM-352M1E option.

| Part | Built | Photograph / basis |
| --- | --- | --- |
| Chassis | the GM-352 hull and running gear as `tunguska_m.md` records (7.93 x 3.24 m, roof 2.00 m, six road wheels) | 01, 03, 07 |
| GM-352M1E stern | raised cooling box over the right rear corner (x -1.515 ... -0.62, z -3.975 ... -2.58, top 2.42 m) with its big grille on the back and a side grille; lower box over the left rear corner (x 0.70 ... 1.515, to z -2.74, top 2.30 m, raked front) with its side grille; the rear-view camera's hooded box on the deck between them | 05, 06, 07 (the boxes), 04 (the camera hood) |
| Ring | hull (0, 2.00, 0.35), as the Tunguska's | |
| Platform | regular octagon, apothem 1.04 to 0.98 m, 0.19 m tall | 03, 09 |
| Central body | 1.10 m wide, z -1.25 ... 0.55, top 2.95 m, its back sloped; the gunner's and commander's hatches down its right side (the stations `internalLayoutRegistry.ts` gives the two-man module), vision blocks, two whips, the back's equipment box; the guns' two ammunition boxes with their stencilled crosses on the platform behind | 05, 06, 09, 10 |
| Tracking radar | drum r 0.50 m along z (0.30 ... 1.05), centre 2.80 m, on its drive housing from the body's front; the 0.94 m radome (pale finish) on its face; the small antenna housing on its upper left with its own cap | 01, 02 (dome ~0.95 m), 03 |
| Search radar | mast r 0.22 to 3.30 m, the 1.30 x 0.95 x 0.28 m panel leaning 6 degrees back, top 4.10 m, antenna face (frame, centre strip, IFF rod) to the rear | 05, 06, 07, 12 |
| 2A38M x 2 | trunnion turret-local (0, 0.86, 0.12) = 2.86 m; guns at x +/-0.80 (inboard of the banks), bores 0.11 m apart in bare dark steel, mouths 2.35 m ahead of the trunnion; the Tunguska's 2A38M builder (`tunguskaM.ts` cannon2A38M) | 02: guns at about +/-0.73 m, dark barrels |
| 57E6 banks x 2 | six containers r 0.085, columns x 1.20 / 1.42, rows y -0.19 / 0.08 / 0.35 (gun-local), z -0.50 ... 2.10; cradle box under the back half, armoured side box (rounded, lid panel) below the outer column, two frames | 01, 02, 08, 09, 14 |

Design decisions:
- The banks pitch with the guns over the -5 ... +85 degree envelope (the real banks elevate on their own); they stand
  0.55 m behind the trunnion and outboard of the platform, so their lowest corner passes 0.15 m over the roof.
- The raised stern boxes start at z -2.58 / -2.74, aft of the hull z -2.33 the banks' tips reach at any bearing.
- The radome is drawn in the fleet's pale finish (`turretCanvasPale`), the nearest material to its yellow.

Receipts (builder R, final chain f1 on the finished build; logs in `~/cot-lanes/twin-aa-268-evidence/R/logs/f1-*.log`):
- `src/vehicles/profiles/gm352AirDefense.selftest.mjs`: PASS (spec = layout; rig seats, fire axes on bore faces in
  barrel groups 0/1, painted barrel stock on each fire axis, 0/1/0 firing order, 8 / 12 launch exits on dark covers in
  rig_gun, tube census, HIGH and LOW; the Pantsir's hull shell holds every Tunguska shell triangle, its extra ones all
  aft of z -2.5; guns and launchers at least 0.065 m off the hull (nothing within the probe's 6.5 cm reach) at every 2
  degrees of yaw at full depression, level, half and full elevation (keep 0.025); 0.030 m (Tunguska) / 0.060 m
  (Pantsir) off their own turret through the arc in 3-degree steps, trunnion journals excepted).
- Roof pockets (`tools/roof-pocket-census.mjs --ids=tunguska_m,pantsir_s1`): 0 for both.
- Accessory contact (`.qa-dev/contactprobe.mjs`): 0 floating, 0 clipping on both (22 accessory pieces).
- Posed renders (turret yaw / gun pitch yaw 30 / +85, yaw 0 / -5, yaw -120 / +45): `~/cot-lanes/twin-aa-268-evidence/R/after/f1_pose_*.png`.
- Gun and launcher sweep: the fleet's own measure (`gunHullProbe`, keep 0.025 m, recoil in battery and at 0.135 m) at
  every 3 degrees of yaw round the circle and every 5 degrees of pitch over -5 ... +85 degrees (2280 poses): none
  below the keep, nothing within the probe's 6.5 cm reach, so no `gunPitchByYawDeg` curve is needed.
  `tools/gun-depression-sweep.mjs --no-suit` (1-degree pitch steps at every whole yaw, about 35,000 probe calls an id)
  needs about 2 h an id here (~0.2 s a probe call under load ~200); builder R stopped it (after 11 and 2 minutes, no line yet)
  rather than let my chain's 40-minute alarm cut it. The coordinator may rerun it where it fits.
- Geometry digest (`.qa-dev/geodigest2.mjs` over 25 ids against the coordinator's baseline): the 23 neighbours of the
  shared code (BMP family, BMPTs, Leopard 1 family, TOS-1A, M6, ...) identical; only `tunguska_m` and `pantsir_s1` moved.
- Selftests naming the ids (f1): vehicleAudioProfiles, ammunitionFlow, afvBalance, camoCatalogProductionIndices,
  nationWheelSets, vehicleFacets, guidedLauncherTubes (censuses tunguska_m 8, pantsir_s1 12), launcherOrigins PASS.
  recoilRig FAILS its twin-plant roster guard for every 268 id that authors `gun.muzzles` (TWIN_PLANT needs them; the
  build meets its per-tube law, which this id's own selftest holds). fleetBalance fails on x1_pioneiro / x1a2_carcara
  (cold-war/1/light penetration), as in the registrar's run: not this id.
- Typecheck (f1): no diagnostic in these files (the run's one is builder C's `chineseAirDefenseSpecs.ts` unused `Point`).
- Not run here (coordinator): the combat-anatomy update and check, marking seats, interior fill, presentation anchors,
  auxiliary inventory, tank assets, the photographic packet, tank:release:check.

## Construction work order (registrar R0; done by builder R except the generated tables)

- Replace the placeholder in `src/vehicles/profiles/gm352AirDefense.ts` with the measured build; keep `src/vehicles/gm352AirDefenseSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
