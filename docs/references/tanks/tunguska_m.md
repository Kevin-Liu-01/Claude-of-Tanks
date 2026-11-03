# 2K22M Tunguska-M (`tunguska_m`), run packet

## Current status

- IDs and display names: `tunguska_m`, "2K22M Tunguska-M" (`src/vehicles/tankLabels.ts`); fleet group `gm352AirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the BMP-3 hull and running gear under a box turret, one 30 mm barrel a side and eight closed SAM canisters), which builder R replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action: builder R authors the measured build in `src/vehicles/profiles/gm352AirDefense.ts` and keeps the spatial datums in
  `src/vehicles/gm352AirDefenseSpecs.ts` (turret and gun pivots, fire axes, launcher mouths, turret plates, turret-local modules and crew) equal to
  the geometry; then the combat-anatomy update, marking seats, interior fill, presentation anchors, auxiliary inventory
  and tank assets for this id (generated tables the registrar did not write: the browser's lazy anatomy and marking-seat
  loaders reject an unknown group until they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 268 twin-cannon air-defence round.
- Owned files (builder R after the registrar): `src/vehicles/gm352AirDefenseSpecs.ts`, `src/vehicles/profiles/gm352AirDefense.ts`, this packet.
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
| Height | 3.36 m search radar folded, 4.02 m raised (M1: ~3.35 m / ~4.0 m) | brief; Wikipedia (M1) |
| Guns | two 2A38M twin-barrel 30 mm (4 barrels), 3,900-5,000 rpm combined, 1,904 rounds | Wikipedia |
| Gun arc | -10 to +87 degrees | Wikipedia |
| Missiles | eight 9M311M, four a side | Wikipedia |
| Chassis / engine | GM-352, V-46 diesel 780 hp (710 hp governed), 65 km/h, 500 km | Wikipedia (M1) |
| Armour | 7.62 mm small arms and shell splinters | Wikipedia |
| Service | 2K22M accepted 1990 | Wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

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
| Fire axes | twin, x = +/-1.10 m in the gun frame (placeholder: one barrel a side) | builder sets the four real barrels |
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

## Construction work order (builder R)

- Replace the placeholder in `src/vehicles/profiles/gm352AirDefense.ts` with the measured build; keep `src/vehicles/gm352AirDefenseSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
