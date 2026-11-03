# PGZ-09 (`pgz09`), run packet

## Current status

- IDs and display names: `pgz09`, "PGZ-09" (`src/vehicles/tankLabels.ts`); fleet group `chineseAirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the BMP-3 hull and running gear under a box turret with one 35 mm barrel on each side), which builder C replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action: builder C authors the measured build in `src/vehicles/profiles/chineseAirDefense.ts` and keeps the spatial datums in
  `src/vehicles/chineseAirDefenseSpecs.ts` (turret and gun pivots, fire axes, launcher mouths, turret plates, turret-local modules and crew) equal to
  the geometry; then the combat-anatomy update, marking seats, interior fill, presentation anchors, auxiliary inventory
  and tank assets for this id (generated tables the registrar did not write: the browser's lazy anatomy and marking-seat
  loaders reject an unknown group until they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 268 twin-cannon air-defence round.
- Owned files (builder C after the registrar): `src/vehicles/chineseAirDefenseSpecs.ts`, `src/vehicles/profiles/chineseAirDefense.ts`, this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration,
  procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, markings anchors,
  roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, audio engine family, the tech
  tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the coordinator's baseline).

## Configuration

The PGZ-09 (Type 09 SPAAA) at the 2017 Beijing exhibition (Tyg728, 01-03): PLA digital woodland, six road
wheels, the turret with a 35 mm gun on each side, the tracking radar in front and the search radar on the turret rear.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (the brief: 3-4) | Wikipedia "PGZ-09" |
| Combat weight | 35 t | Wikipedia |
| Length / width / height | 6.7 m / 3.2 m / 3.4 m radar down (4.82 m up) | Wikipedia (these repeat the PGZ-95's; the photographs' six widely spaced road wheels suggest a longer hull: measure it) |
| Guns | two PG99 35 mm, 1,100 rpm combined; no published ammunition load | Wikipedia |
| Gun arc | not published (-2 / +85 in a game wiki) | War Thunder wiki |
| Engine / speed / range | 8V150 diesel 800 hp / 55 km/h / 450 km | Wikipedia |
| Armour | welded steel, small arms and splinters; the frontal arc against 14.5 mm | Wikipedia |
| Service | from 2009 | Wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion; after the PGZ-95 on China's air-defence line |
| Class / role / status / era | spaa / scout (recon) / service / modern | |
| HP, engine, weight | 2,400 / 800 hp / 35 t | Wikipedia |
| Speed, reverse, traverse | 55 / 18 km/h / 40 and 70 deg/s authored (44.8 and 77 after recon) | |
| Gun arc | -5 / +85 degrees, 50 deg/s | held at the PGZ-95's -5 pending a sourced figure |
| 35 mm | APDS-T 142/128/114 mm, 58 dmg, 1,385 m/s, 40 rounds; HEI-T 54 dmg, 1,175 m/s, 640 rounds; 0.33 s | the BMPT T-90's rows (tier VI) scaled by calibre (x 35/30); the Gepard's 40 + 640 load for the same Oerlikon-pattern twin 35 mm |
| SAM | none (the optional 2-4 MANPADS are not carried) | |
| Fire control | 0.25 accuracy, 1.05 s aim (0.99 after recon) | |
| Fire axes | twin, x = +/-1.30 m (placeholder) | |
| Paint | stock `sig_ztz100_x` (the ZTZ-100's PLA digital woodland, the ZTZ-20's stock), spec coat the same recipe | the 2017 photographs' four-tone digital |
| Marking | hull left anchor, number 091 | |
| View / camouflage | 445 m, 0.230 / 0.200 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-268-evidence/photos/pgz09/` (comparison only; never shipped).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [PGZ-09 Self-propelled Anti-Aircrafft Artillery 20170919.jpg](https://commons.wikimedia.org/wiki/File:PGZ-09_Self-propelled_Anti-Aircrafft_Artillery_20170919.jpg) | Tyg728 | CC BY-SA 4.0 | 2017-09-19 |
| 02 | [PGZ-09 Self-propelled anti-aircraft artillery 20170902.jpg](https://commons.wikimedia.org/wiki/File:PGZ-09_Self-propelled_anti-aircraft_artillery_20170902.jpg) | Tyg728 | CC BY-SA 4.0 | 2017-09-02 |
| 03 | [PGZ-09 Self Propelled Anti-Aircrafft Gun 20170902.jpg](https://commons.wikimedia.org/wiki/File:PGZ-09_Self_Propelled_Anti-Aircrafft_Gun_20170902.jpg) | Tyg728 | CC BY-SA 4.0 | 2017-09-02 |

## Construction work order (builder C)

- Replace the placeholder in `src/vehicles/profiles/chineseAirDefense.ts` with the measured build; keep `src/vehicles/chineseAirDefenseSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
