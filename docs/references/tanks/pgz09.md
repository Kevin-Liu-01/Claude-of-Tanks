# PGZ-09 (`pgz09`), run packet

## Current status

- IDs and display names: `pgz09`, "PGZ-09" (`src/vehicles/tankLabels.ts`); fleet group `chineseAirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: MEASURED BUILD (builder C, 2026-11-02): `src/vehicles/profiles/chineseAirDefense.ts` (turret and
  guns) on `src/vehicles/profiles/plaAirDefenseChassis.ts` (hull and running gear), datums in
  `src/vehicles/profiles/chineseAirDefenseLayout.ts`, read by `src/vehicles/chineseAirDefenseSpecs.ts`. Receipt:
  `src/vehicles/profiles/chineseAirDefense.selftest.mjs`.
- Qualification status: NOT RUN. Photographic qualification and the generated tables (combat anatomy, marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets) are owed by the integrator.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action: the integrator runs the combat-anatomy update and check, marking seats, interior fill,
  presentation anchors, auxiliary inventory and tank assets for this id, registers the selftest, and owns the
  photographic packet.

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 268 twin-cannon air-defence round.
- Owned files (builder C after the registrar): `src/vehicles/chineseAirDefenseSpecs.ts`, `src/vehicles/profiles/chineseAirDefense.ts`,
  `src/vehicles/profiles/plaAirDefenseChassis.ts`, `src/vehicles/profiles/chineseAirDefenseLayout.ts`,
  `src/vehicles/profiles/chineseAirDefense.selftest.mjs`, this packet.
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

## As built (builder C, 2026-11-02)

Hull frame: ground y 0, +z forward, +x the vehicle's left. Photograph 02 is a square right-side view: scaled by the
published 3.40 m radar-down height (the folded search antenna's top) it reads 4.8 mm a pixel at 1600 px wide, and the
0.74 m road wheels and 0.15 m track pitch it gives agree. That scale makes the hull 7.06 m, not the 6.7 m the
encyclopaedia pages repeat from the PGZ-95 (the conflict the registrar flagged): the build follows the photograph.

| Part | Built | Basis |
| --- | --- | --- |
| Hull | 7.06 m (z -3.50 to +3.56), 3.20 m wide, roof 1.74 m, belly 0.45 m; 7.31 m over the idlers' track wraps behind the hull | photo 02 at the published height; published width |
| Hull shape | vertical sides over the tracks with a chamfered roof edge, the glacis from z +2.65 down 27 deg to a sharp nose at 0.95 m, the lower plate raked back to the belly | photos 01-03 |
| Front | caged headlight boxes on the glacis corners, fender boxes over the sprockets, two stowed track sections and the tow rope on the lower plate, tow eyes at the nose corners | photos 01, 03 |
| Hull fittings | driver's hatch front left with three vision blocks, engine grille front right, air louvre on the left side, stowage drum on the rear right corner | photos 01-02 |
| Running gear | six road wheels r 0.37 at 0.914 m pitch (z +2.19 to -2.38), front sprocket r 0.29, a high rear idler r 0.33 (z -3.34, y 0.76) standing behind the hull, three return rollers, 0.48 m track at x +-1.34, top run 1.16 m | photo 02; China's IFV wheel standard |
| Turret | 3.6 m long (z -2.88 to +0.72 in the hull), ring at z -1.10; a lower band leaning out to the 0.45 m belt, the upper body to a 1.30 m roof with bevelled edges; the front column under the EO head (round lens, window, laser warning plate), the round tracking-radar antenna (0.58 m) on a stalk in front of it; three smoke dischargers a side on the band; two roof hatches, the gunner's periscope, the search antenna folded flat on its pedestal (top 1.66 m over the ring: the 3.40 m height), the rear sight box | photos 01-03; Wikipedia (radar positions) |
| Guns | a PG99 35 mm a side at x +-1.25, 0.84 m over the ring (2.58 m), in a wedge-shaped armoured housing (x 1.06-1.44, 1.23 m long, deep at the front, its underside rising to the rear) on a trunnion 0.45 m behind the ring; barrel r 0.046 with a thicker root, muzzle booster and velocity ring to the 3.40 m muzzle plane (1.85 m ahead of the hull centre) | photo 02 (housing, barrel line, muzzle 1 m ahead of the tracking antenna) |
| Fire axes | twin, x +-1.25, y 0, one recoil group a side | |
| Armour (game) | hull 30/34 glacis, 28/32 nose, 15/17 sides, 12/14 rear, 10/11 roof; turret 30/34 front, 15/17 sides (KE/CE mm) | Wikipedia: welded steel, the frontal arc against 14.5 mm |

Dims: hull 7.06 m, overall 7.31 m, 3.20 m wide, 3.40 m high.

Also drawn: the loading door on the turret rear wall and the lifting lugs on its roof bevel.

### Builder C receipts (2026-11-02/03, worktree uncommitted)

| Check | Result |
| --- | --- |
| `src/vehicles/profiles/chineseAirDefense.selftest.mjs` (datums, bores, launch exits, envelope 3 %, guns 2 cm from the turret every 2.5 deg of pitch, 2.5 cm from the hull every 5 deg of yaw and pitch) | PASS |
| Hull clearance every 1 deg of yaw at 13 pitches from -5 to 85 deg (`gunHullProbe`, keep 0.026 m; `.qa-dev/C/sweep1deg.mjs`) | PASS, no curve needed |
| `tools/gun-depression-sweep.mjs --no-suit` | NOT RUN to completion: the machine's load (85-250) held it at 10-15 % CPU, killed after 2 h |
| Accessory contact probe | PASS (0 floating, 0 clipping) |
| `tools/roof-pocket-census.mjs` | PASS (no pockets) |
| `npm run -s typecheck` | PASS |
| Geometry digest: 15 neighbouring ids (BMP-3 family, Type 100, AFT-10, Type 59, ZTZ-100/20/85-III/99A2, VT-4A1, both BMPTs, M6, TOS-1A) | byte-identical to the coordinator's baseline |

### Fix round 1 (2026-11-03, critics A and B on round-1 renders)

Photograph 02's top silhouette, measured per column at the same scale: the turret's rear part (the gun housings' tops,
the roof between them) stands 1.27 m over the ring, its front part 1.06 m from z -0.47 (hull) forward, the EO head
1.24 m, the folded search antenna 1.62-1.67 m from z -1.99 to -1.35 with a box behind it to 1.62 m.

- Gun housings: tall angular boxes 1.42 m long, their tops the rear roof (1.27 m over the ring), 0.40 m wide outboard of
  the upper body (x 1.02-1.42), the front face 0.57 m deep, the underside a wedge down to its keel 56 % of the way from
  the rear; the trunnion over the keel (turret-local (0, 0.84, -0.575)); muzzle plane 3.52 m, still 1.85 m ahead of the
  hull centre.
- Turret: a base tier from the ring to a 0.40 m ledge, set in under the upper body; the upper body stepped from the
  1.27 m rear roof down to a 1.06 m front part at turret-local z 0.62.
- Search antenna: a 0.92 x 0.76 x 0.26 m box lying fore and aft on a two-step pedestal, its front top edge chamfered,
  its rear edge 0.83 m ahead of the turret's rear face; the rear box behind it.
- Tracking radar: 0.60 m across (kept: photograph 02, 150 px of the full-resolution frame) and 0.26 m deep (was 0.15).
- Hull: the deep side plates over the front 1.42 m, down to 0.85 m, with an access hatch.
- Rear wall: four hinge latches and the antenna base.
- Road wheels: as the PGZ-95 (requested: the ZTZ-100 recessed-web exception).
