# PGZ-95 (`pgz95`), run packet

## Current status

- IDs and display names: `pgz95`, "PGZ-95" (`src/vehicles/tankLabels.ts`); fleet group `chineseAirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: MEASURED BUILD (builder C, 2026-11-02): `src/vehicles/profiles/chineseAirDefense.ts` (turret, pods,
  radar) on `src/vehicles/profiles/plaAirDefenseChassis.ts` (hull and running gear), datums in
  `src/vehicles/profiles/chineseAirDefenseLayout.ts`, read by `src/vehicles/chineseAirDefenseSpecs.ts` (ring, trunnion, fire
  axes, launch exits, armour plates, modules, crew). Receipt: `src/vehicles/profiles/chineseAirDefense.selftest.mjs`.
- Qualification status: NOT RUN. Photographic qualification (a dated packet under `docs/references/photos/`, registered
  in `tools/photo-reference-policy.mjs`, with a fixture selftest) and the generated tables (combat anatomy, marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets) are owed by the integrator.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action: the integrator runs the combat-anatomy update and check, marking seats, interior fill,
  presentation anchors, auxiliary inventory and tank assets for this id (the browser's lazy anatomy and marking-seat
  loaders reject an unknown group until they exist), registers the selftest, and owns the photographic packet.

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

## As built (builder C, 2026-11-02)

Hull frame: ground y 0, +z forward, +x the vehicle's left (`src/vehicles/vehicleSide.ts`). Every number below is in
`chineseAirDefenseLayout.ts`; "photo" means read from the two museum photographs against the published length and width.

| Part | Built | Basis |
| --- | --- | --- |
| Hull | 6.71 m nose to rear plate, 3.20 m over the fenders, roof 1.62 m, belly 0.40 m | published length and width; heights photo |
| Hull shape | flat roof to z +1.20, the engine deck sloping 14 deg to a 1.16 m front edge at +3.02, the nose plate raked 28 deg to 0.46 m, upper sides leaning in from 1.60 m at the 1.05 m fender to 1.36 m at the roof | photo 01 |
| Front | two big deck grilles side by side and a small one behind (engine front right), fender boxes with caged headlights over the sprockets, mudguard plates ahead of the sprockets, two pairs of tow brackets on the nose plate | photo 01; Army Technology (front engine) |
| Crew hatches | driver's raised block front left (z 0.84-1.34), the commander's behind it (z 0.22-0.68), three vision blocks and a round hatch each | Army Technology ("raised hatch and three vision blocks"); photo 02 |
| Running gear | six road wheels r 0.31 (z +2.22 to -2.23, 0.89 m pitch), front sprocket r 0.26 at y 0.62, rear idler r 0.25 at y 0.52, three return rollers, 0.40 m track at x +-1.38, top run 0.97 m | Wikipedia (6 wheels, 3 rollers); photo 01; China's IFV wheel standard (Type 100 construction) |
| Turret | one-man turret on the rear half, ring at z -1.20; body 1.68 m wide, 2.10 m long, roof 0.92 m over the ring with chamfered edges and a sloped front; EO director's armoured box on the front left with TV/IR windows; four smoke grenade launchers at each front corner | Army Technology; photos 01-02 |
| Guns | an over-under pair of Type 87 25 mm a side (pod centre x +-1.08, bores 0.34 m apart), open cradle plates, exposed receivers, barrels r 0.026 clamped together at z 1.30, flash hiders to the 2.43 m muzzle plane; trunnion at turret-local (0, 0.62, 0.15) | Wikipedia ("two a side"); photo 02 (pairs stacked over-under, receivers open, the midway clamp) |
| QW-2 | four tubes, two stacked over each pair (x +-1.11, y 0.41/0.56 over the trunnion), seeker-cap boxes, exits at z 1.58; they pitch with the guns | Wikipedia ("above the cannons"); photo 02 |
| Search radar | CLC-1 reflector 1.40 x 1.10 m on a mast at the turret rear, raised as photographed: top 4.47 m | photo 02; published 4.82 m raised, 3.40 m folded |
| Fire axes | the upper bore of each pair (x +-1.08, y +0.17); each side's two tubes share that side's recoil group | four independent tubes need two more barrel buckets in the factory (not in this lane) |
| Armour (game) | hull 18/20 front, 12/14 sides, 10/12 rear, 8/9 roof; turret 14/16 front, 10/12 sides (KE/CE mm) | high-hardness steel against small arms and splinters (Army Technology) |

Dims: 6.71 x 3.20 x 4.47 m (the height is the raised antenna's, the build's own).

Also drawn: the gunner's sight head on the director box, the access door in the left wall.

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
