# 2K22M Tunguska-M (`tunguska_m`), run packet

## Current status

- IDs and display names: `tunguska_m`, "2K22M Tunguska-M" (`src/vehicles/tankLabels.ts`); fleet group `gm352AirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0; measured build, builder R).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: BUILT (builder R, 2026-11-02). The registrar's BMP-3 placeholder is gone: the measured GM-352
  chassis (`src/vehicles/profiles/gm352Chassis.ts`, shared with `pantsir_s1` as an option) under the 2K22M turret
  (`src/vehicles/profiles/tunguskaM.ts`); every datum the spec reads lives in one table,
  `src/vehicles/profiles/gm352Layout.ts`, read by the builders and by `src/vehicles/gm352AirDefenseSpecs.ts`.
- Qualification status: physical receipts in the build section below. Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is still owed:
  the as-built box is 8.08 x 3.25 x 4.05 m to the raised dish, 4.26 m to the whip's tip (hull 7.93 m; the stern
  stowage box stands 0.13 m proud of the plate).
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

The 2K22M (2S6M) Tunguska-M as photographed at Tank Biathlon 2014 (Kuzmin, 01-06), the 2008 Moscow parade
rehearsal (07-08) and the related Tunguska-M1 at MAKS 2007/2011 (09-13: the M1's 9M311-M1 launchers differ in detail;
use 01-08 for the M's own fit). GM-352 chassis, six road wheels with return rollers, the turret with the folding search
radar at the rear and the tracking radar dish at the front, a 2A38M twin-barrel 30 mm on each side with two 9M311M
canisters above and outboard of it, plain Russian green.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 4 (commander, driver, gunner, radar operator) | Wikipedia "2K22 Tunguska" |
| Combat weight | ~34 t (the M1 ~35 t) | brief; Wikipedia (M1) |
| Length / width | 7.93 m / 3.24 m (M1: ~7.90 m / ~3.25 m) | brief; Wikipedia (M1) |
| Height | 3.36 m search radar folded, 4.02 m raised (M1: ~3.35 m / ~4.0 m); the build shows it raised, `dims.heightM` 4.02 | brief; Wikipedia (M1) |
| Guns | two 2A38M twin-barrel 30 mm (4 barrels), 3,900-5,000 rpm combined, 1,904 rounds | Wikipedia |
| Gun arc | -10 to +87 degrees | Wikipedia |
| Missiles | eight 9M311M, four a side | Wikipedia |
| Chassis / engine | GM-352, V-46 diesel 780 hp (710 hp governed), 65 km/h, 500 km | Wikipedia (M1) |
| Armour | 7.62 mm small arms and shell splinters | Wikipedia |
| Service | 2K22M accepted 1990 | Wikipedia |

## Registration numbers (combat rows are the registrar's; spatial datums are the measured build's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; the Russia tree's new Tunguska and Pantsir line off the BMP-3 (lane 13) |
| Class / role / status / era | spaa / scout (doctrine recon) / service / modern | the M6 Linebacker's facets; accepted 1990 |
| HP, engine, weight | 2,300 / 780 hp / 34 t | light armour at the tier-V IFV median band |
| Speed, reverse, hull and turret traverse | 65 / 18 km/h / 40 and 70 deg/s authored (44.8 and 77 after recon) | Wikipedia; BMPT reverse |
| Gun arc | -10 / +87 degrees, 50 deg/s | Wikipedia; the pitch model allows any arc under 90 degrees |
| 30 mm | 3UBR8 APDS 125/112/100 mm, 52 dmg, 1,120 m/s, 952 rounds; 3UOF8 HE-I 48 dmg, 960 m/s, 952 rounds; 0.30 s | the BMPT Terminator 2's twin 2A42 rows at their shown-tier floor (the 2A38M fires the same 30 x 165 mm) |
| SAM | 9M311M: 360 dmg, 25 mm, 900 m/s, 8 rounds, 8 tubes, 3.0 s, `tow-launch` | the M6 Linebacker's Stinger handling; the 9M311's peak speed |
| Fire control | 0.26 accuracy, 1.10 s aim (1.03 after recon) | |
| Fire axes | twin, x = +/-0.945 m in the gun frame: each 2A38M's inner bore (barrel groups 0 and 1); the outer bores are drawn with their own dark mouths | builder R, gm352Layout.ts TUNGUSKA |
| Paint | stock `national_ru` (Russia's plain service green), spec coat the same recipe | the photographs' solid green; no new paint |
| Marking | hull left anchor, number 211, Russian marking set | |
| View / camouflage | 440 m, 0.230 still / 0.200 moving | the Linebacker's recon profile |

## Photographic references

Saved under `~/cot-lanes/twin-aa-268-evidence/photos/tunguska/` (comparison only; never shipped).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [2S6M combat vehicle 2K22M Tunguska-M - TankBiathlon14part2-25.jpg](https://commons.wikimedia.org/wiki/File:2S6M_combat_vehicle_2K22M_Tunguska-M_-_TankBiathlon14part2-25.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2014-06-28 |
| 02 | [2S6M combat vehicle 2K22M Tunguska-M - TankBiathlon14part2-26.jpg](https://commons.wikimedia.org/wiki/File:2S6M_combat_vehicle_2K22M_Tunguska-M_-_TankBiathlon14part2-26.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2014-06-28 |
| 03 | [2S6M combat vehicle 2K22M Tunguska-M - TankBiathlon14part2-27.jpg](https://commons.wikimedia.org/wiki/File:2S6M_combat_vehicle_2K22M_Tunguska-M_-_TankBiathlon14part2-27.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2014-06-28 |
| 04 | [2S6M combat vehicle 2K22M Tunguska-M - TankBiathlon14part2-28.jpg](https://commons.wikimedia.org/wiki/File:2S6M_combat_vehicle_2K22M_Tunguska-M_-_TankBiathlon14part2-28.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2014-06-28 |
| 05 | [2S6M combat vehicle 2K22M Tunguska-M - TankBiathlon14part2-29.jpg](https://commons.wikimedia.org/wiki/File:2S6M_combat_vehicle_2K22M_Tunguska-M_-_TankBiathlon14part2-29.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2014-06-28 |
| 06 | [2S6M combat vehicle 2K22M Tunguska-M - TankBiathlon14part2-30.jpg](https://commons.wikimedia.org/wiki/File:2S6M_combat_vehicle_2K22M_Tunguska-M_-_TankBiathlon14part2-30.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2014-06-28 |
| 07 | [2008 Moscow May Parade Rehearsal - Tunguska side view.JPG](https://commons.wikimedia.org/wiki/File:2008_Moscow_May_Parade_Rehearsal_-_Tunguska_side_view.JPG) | Vovan | CC BY 3.0 | 2008-05-05 |
| 08 | [2008 Moscow May Parade Rehearsal - Tunguska turret.JPG](https://commons.wikimedia.org/wiki/File:2008_Moscow_May_Parade_Rehearsal_-_Tunguska_turret.JPG) | Vovan | CC BY 3.0 | 2008-05-05 |
| 09 | [2S6M1 Tunguska-M1 SAM-system at MAKS-2011 - side.jpg](https://commons.wikimedia.org/wiki/File:2S6M1_Tunguska-M1_SAM-system_at_MAKS-2011_-_side.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2011-08 |
| 10 | [2S6M1 Tunguska-M1 SAM-system at MAKS-2011.jpg](https://commons.wikimedia.org/wiki/File:2S6M1_Tunguska-M1_SAM-system_at_MAKS-2011.jpg) | Vitaly V. Kuzmin | CC BY-SA 4.0 | 2011-08 |
| 11 | [Tunguska M1 at the MAKS-2011 (01).jpg](https://commons.wikimedia.org/wiki/File:Tunguska_M1_at_the_MAKS-2011_(01).jpg) | Doomych | Public domain | 2011-08-19 |
| 12 | [9K22 Tunguska gun and missiles.JPG](https://commons.wikimedia.org/wiki/File:9K22_Tunguska_gun_and_missiles.JPG) | Dmitry | CC BY-SA 3.0 | 2007-08-24 |
| 13 | [Tunguska-M1 at 2007 MAKS Airshow.jpg](https://commons.wikimedia.org/wiki/File:Tunguska-M1_at_2007_MAKS_Airshow.jpg) | Yuriy Lapitskiy | CC BY-SA 2.0 | Taken on 2 |

## Measured build (builder R, 2026-11-02)

Datums: `src/vehicles/profiles/gm352Layout.ts` (hull frame: y 0 the ground, +z forward, +x the vehicle's left).
Scale from photograph 02 (Kuzmin's near-orthographic right side): hull 1,815 px = 7.93 m, 229 px/m.

| Part | Built | Photograph / basis |
| --- | --- | --- |
| Hull | 7.93 m (z +/-3.965), sides +/-1.50, fender bands to +/-1.62 (3.24 m), roof 2.00 m, sponsons' undersides 1.29 m, belly 0.45 m, lower hull +/-1.06 between the tracks | 02, 05: roof 650 px (1.99 m), fender band 805-850 px (1.11-1.31 m); published 7.93 x 3.24 m |
| Bow | upper glacis 36 degrees from the roof's front edge (z 3.15) to the nose edge (1.40 m), lower glacis 57 degrees to the belly at z 3.35 | 02, 05, 06, 13 |
| Stern | rear deck sloping from z -3.40 to the stern plate's top (1.84 m), vertical plate, sloped lower plate with four tow eyes, rubber flaps behind the sprockets | 03, 04 |
| Running gear | six road wheels r 0.34 m at z 2.43 ... -2.52 (0.99 m pitch), sprocket z -3.30 / 0.86 m / r 0.32, idler z 2.98 / 0.86 m / r 0.30, three return rollers, track 0.36 m on xc 1.29 | 02: wheel centres 390-1520 px, r 79 px; sprocket and idler hubs 905 px (0.87 m) |
| Hull fittings | driver's raised vision box front left with its glass and hatch; equipment box front right; headlight boxes on the glacis' corners; tow cable on the glacis; side access panels; right side's radiator grille and louvres; left side's long exhaust grille; engine-deck hatches and grille; stern door and stowage box | 01, 02, 05, 06, 13 |
| Turret ring | hull (0, 2.00, 0.35) | the lower turret's centre, 02 and 05 |
| Lower turret | regular octagon, apothem 1.12 to 1.06 m, 0.26 m tall, 12 mm over the deck on its collar | 02, 05, 06: the wide faceted base, ~2.6-2.9 m across |
| Upper body / radar housing | 1.60 m wide, z -1.30 ... 1.20, roof 3.02 m; housing 1.56 m wide, z -2.00 ... -1.20, top 3.10 m | 02: roof 400 px (3.08 m); 03, 04: the housing's back |
| Search radar | raised: pedestal, yoke and the 1.60 x 0.72 m elliptical dish facing back, top 4.05 m (the dish is open equipment, drawn at every range: `turretCupola`) | 09-11 (raised); published 4.02 m |
| Tracking radar | 0.84 m drum on the body's front, centre 2.56 m, its side arms and the drive housing under it | 01, 06, 10 (the dish ~0.9 m) |
| Roof | commander's cupola front left, gunner's hatch and sight head front right (top 3.38 m), vision blocks, whip: the crew stations `internalLayoutRegistry.ts` spaaTunguska gives | 01, 02, 05; published 3.36 m (radar folded) |
| 2A38M x 2 | trunnion turret-local (0, 0.72, 0.18) = 2.72 m; guns at x +/-1.00, bores 0.11 m apart in bare dark steel, perforated cooling jackets (grooved lathe at HIGH), muzzle braces, mouths 2.20 m ahead of the trunnion; one shared builder (`tunguskaM.ts` cannon2A38M) for both modules | 02: gun axis 485 px (2.71 m); 01, 06, 12: black barrels side by side |
| 9M311M racks x 2 | rounded cradle box x 1.18-1.62, z -0.42 ... 0.70, y -0.34 ... 0.16 (gun-local); four containers r 0.10, two by two, mouths at z 1.72; behind each, on the turret flank, the racks' drive housing carrying the rounded profile aft (turret z -1.25 ... -0.45), built out from the body side | 02, 05: the long rounded box over the flank (1.46 x 0.48 m at 2.60 m); 09, 12 (containers forward of it) |

Design decisions:
- The racks pitch with the guns (the game's one elevation; the real racks elevate independently). Their backs stand
  0.42 m behind the trunnion (the real cradle box runs ~1 m behind it), so at every elevation to +87 degrees they keep
  over the deck: the lowest corner passes 0.195 m over the roof (2.195 m). The rest of the photographs' long rounded
  box is the fixed drive housing behind it, clear of the 0.54 m the cradle's corners sweep round the trunnion.
- The driver's and the right front boxes start at z 2.88, past the 2.85 m the racks' corners reach at any bearing.
- The search radar is shown raised (as most photographs show the radar), the dish facing back as it stows.

Receipts (builder R, final chain f1 on the finished build; logs in `~/cot-lanes/twin-aa-268-evidence/R/logs/f1-*.log`):
- `src/vehicles/profiles/gm352AirDefense.selftest.mjs`: PASS (spec = layout; rig seats, fire axes on bore faces in
  barrel groups 0/1, painted barrel stock on each fire axis, 0/1/0 firing order, 8 / 12 launch exits on dark covers in
  rig_gun, tube census, HIGH and LOW; the Pantsir's hull shell holds every Tunguska shell triangle, its extra ones all
  aft of z -2.5; guns and launchers at least 0.065 m off the hull (nothing within the probe's 6.5 cm reach) at every 2
  degrees of yaw at full depression, level, half and full elevation (keep 0.025); 0.030 m (Tunguska) / 0.060 m
  (Pantsir) off their own turret through the arc in 3-degree steps, trunnion journals excepted).
- Roof pockets (`tools/roof-pocket-census.mjs --ids=tunguska_m,pantsir_s1`): 0 for both.
- Accessory contact (`.qa-dev/contactprobe.mjs`): 0 floating, 0 clipping on both (22 accessory pieces).
- Posed renders (turret yaw / gun pitch yaw 30 / +87, yaw 0 / -10, yaw 120 / +45): `~/cot-lanes/twin-aa-268-evidence/R/after/f1_pose_*.png`.
- Gun and launcher sweep: the fleet's own measure (`gunHullProbe`, keep 0.025 m, recoil in battery and at 0.135 m) at
  every 3 degrees of yaw round the circle and every 5 degrees of pitch over -10 ... +87 degrees (2520 poses): none
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
