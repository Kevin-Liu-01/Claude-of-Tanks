# Pantsir-S1 (tracked) (`pantsir_s1`), run packet

## Current status

- IDs and display names: `pantsir_s1`, "Pantsir-S1 (tracked)" (`src/vehicles/tankLabels.ts`); fleet group `gm352AirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the BMP-3 hull and running gear under a box turret, one 30 mm barrel a side and twelve closed SAM canisters), which builder R replaces with measured geometry in the group files.
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

The 96K6 Pantsir-S1 combat module on the tracked GM-352M1E chassis, the Engineering Technologies 2012 vehicle
(01-15) and MAKS 2013 (16): the front tracking radar's round dome, the rear flat search radar panel, two six-tube 57E6
banks and the two 2A38M guns, plain Russian green.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 | brief; Wikipedia "Pantsir missile system" |
| Length | ~7.8 m | brief |
| Weight | not published for the GM-352M1E option; 35 t estimated (the GM-352 family's 34-35 t) | estimate |
| Height | not published; 4.10 m estimated to the search radar | estimate from the 2012 photographs |
| Guns | two 2A38M twin-barrel 30 mm, 2,500 rpm a gun, 700 rounds a gun (1,400) | Wikipedia |
| Missiles | twelve 57E6 in two six-tube banks | Wikipedia; brief |
| Envelope | -5 to +85 degrees (the system's vertical engagement envelope) | Wikipedia |
| Status | listed by Wikipedia as an option under prototypes (first shown 2005 MILEX, Engineering Technologies 2012) | Wikipedia; search |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

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
| Fire axes | twin, x = +/-1.08 m (placeholder) | |
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

## Construction work order (builder R)

- Replace the placeholder in `src/vehicles/profiles/gm352AirDefense.ts` with the measured build; keep `src/vehicles/gm352AirDefenseSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
