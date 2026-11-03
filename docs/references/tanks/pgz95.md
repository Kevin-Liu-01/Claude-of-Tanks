# PGZ-95 (`pgz95`), run packet

## Current status

- IDs and display names: `pgz95`, "PGZ-95" (`src/vehicles/tankLabels.ts`); fleet group `chineseAirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the BMP-3 hull and running gear under a box turret, one 25 mm barrel a side and four closed QW-2 canisters), which builder C replaces with measured geometry in the group files.
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

The PGZ-95 (Type 95 SPAAA) at the Military Museum of the Chinese People's Revolution, Beijing (01-02): green and
sand PLA coat, the turret with a 25 mm pair on each side, two QW-2 tubes a side above the guns and the search radar
on the turret rear. Six road wheels. Only two photographs: a side view and a front three-quarter of the chassis would
help (name: any Commons parade photograph of the 1999 or 2009 National Day parades).

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (driver, commander, gunner) | Wikipedia "Type 95 SPAAA" |
| Combat weight | 22.5 t | Wikipedia |
| Length / width / height | 6.71 m / 3.20 m / 3.40 m radar down (4.82 m up) | Wikipedia |
| Guns | four Type 87 25 mm (two a side), 600-800 rpm a gun, ~1,000 rounds | Wikipedia; Army Technology; GlobalSecurity |
| Missiles | four QW-2 (or FN-6), two a side | Wikipedia |
| Gun arc | -5 to +85 degrees (a game wiki is the only listing) | War Thunder wiki (PGZ04A) |
| Engine / speed / range | diesel, power unpublished (600 hp estimated) / 53 km/h / 450 km | Wikipedia |
| Service | from 1999 | Wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; China's new PGZ-95 and PGZ-09 line off the AFT-10 (lane 4: lane 3 lies under the AFT-10's run to the ZTZ-100 Prototype) |
| Class / role / status / era | spaa / scout (recon) / service / modern | |
| HP, engine, weight | 2,000 / 600 hp (estimate) / 22.5 t | |
| Speed, reverse, traverse | 53 / 16 km/h / 44 and 65 deg/s authored (49.3 and 71.5 after recon) | Wikipedia |
| Gun arc | -5 / +85 degrees, 45 deg/s | |
| 25 mm | APDS-T 125/112/100 mm, 43 dmg, 1,150 m/s, 500 rounds; HEI-T 40 dmg, 1,050 m/s, 500 rounds; 0.25 s | the Terminator 2's rows scaled by calibre (x 25/30) for damage and cycle; the calibre-scaled 104 mm penetration sat at 0.56 of the tier-V IFV median (`balanceAudit.ts` floor 0.65), so the round takes the shown-tier floor `applyShownTierFloors` gave the Terminator |
| SAM | QW-2: 300 dmg, 15 mm, 650 m/s, 4 rounds, 4 tubes, 3.0 s, `tow-launch` | the Linebacker's Stinger handling |
| Fire control | 0.28 accuracy, 1.15 s aim (1.08 after recon) | |
| Fire axes | twin, x = +/-1.10 m (placeholder: one barrel a side; the real vehicle has two a side) | |
| Paint | stock `sig_type59` (the Type 59's PLA green-and-sand organic Signature), spec coat the same recipe | the museum vehicle's green and sand; the fleet has no PLA two-tone, so the closest existing PLA coat is reused rather than a new paint |
| Marking | hull left anchor, number 951 | |
| View / camouflage | 430 m, 0.240 / 0.210 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-268-evidence/photos/pgz95/` (comparison only; never shipped).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [Type 95 SPAAG - Beijing Museum 1.jpg](https://commons.wikimedia.org/wiki/File:Type_95_SPAAG_-_Beijing_Museum_1.jpg) | Max Smith | Public domain | 2007-08-10 |
| 02 | [Type 95 SPAAG - Beijing Museum 2.jpg](https://commons.wikimedia.org/wiki/File:Type_95_SPAAG_-_Beijing_Museum_2.jpg) | Max Smith | Public domain | 2007-08 |

## Construction work order (builder C)

- Replace the placeholder in `src/vehicles/profiles/chineseAirDefense.ts` with the measured build; keep `src/vehicles/chineseAirDefenseSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
