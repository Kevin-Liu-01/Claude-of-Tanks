# Pantsir-S1 (tracked) (`pantsir_s1`), run packet

## Current status

- IDs and display names: `pantsir_s1`, "Pantsir-S1 (tracked)" (`src/vehicles/tankLabels.ts`); fleet group `gm352AirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0; measured build, builder R).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: BUILT (builder R, 2026-11-02; fix rounds 1 and 2 on the photo and A/B critics, 2026-11-03). The registrar's BMP-3 placeholder is gone: the measured GM-352
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
| Fire axes | twin, x = +/-0.725 m in the gun frame (round 3: bores 0.15 m apart): each 2A38M's inner bore (barrel groups 0 and 1) | builder R, gm352Layout.ts PANTSIR |
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
| Chassis | the GM-352 hull and running gear as `tunguska_m.md` records (7.93 x 3.24 m, roof 2.00 m, six road wheels), with its solid fender shelf pointed at the bow, the driver's hump with its windscreen and the headlight pods (round 3, one change in `gm352Chassis.ts` for both ids) | 01, 02, 03, 07, 15 (the bevelled fender, the hump and the pods) |
| GM-352M1E stern | raised cooling box over the right rear corner (x -1.515 ... -0.62, z -3.975 ... -2.58, top 2.42 m) with its big grille on the back and a side grille; lower box over the left rear corner (x 0.70 ... 1.515, to z -2.74, top 2.30 m, raked front) with its side grille; the rear-view camera's hooded box on the deck between them, 0.40 m wide, 0.48 m tall (round 2) | 05, 06, 07 (the boxes: the tall louvred block ends over the rearmost road wheel), 04, 06 (the camera hood) |
| Ring | hull (0, 2.00, 0.35), as the Tunguska's | |
| Platform | regular octagon, apothem 1.04 to 0.98 m, 0.19 m tall | 03, 09 |
| Central body | 1.10 m wide, z -1.25 ... 0.55, top 2.95 m, its back sloped; the gunner's and commander's hatches down its right side (the stations `internalLayoutRegistry.ts` gives the two-man module), vision blocks, two whips on its roof ahead of the search radar, the back's equipment box; the guns' two ammunition boxes with their stencilled crosses on the platform behind | 05, 06, 09, 10 |
| Tracking radar | drum r 0.50 m along z (0.30 ... 1.05), centre 2.80 m, on its drive housing from the body's front; the 0.94 m radome (pale finish) on its face; the small antenna housing on its upper left with its own cap | 01, 02 (dome ~0.95 m), 03 |
| Search radar | mast r 0.22 (z -1.00) to 3.30 m; a landscape box antenna 1.36 x 0.80 x 0.34 m (round 3: 1.7 : 1, its depth a quarter of its width), its top corners chamfered 0.12 m and its back vertical edges 0.08 m, leaning 3 degrees back with its front face behind the guns' receivers at full elevation, top 4.03 m; on its back face a column of fan grilles down each side and four vertical ribs between; under the back face the IFF bracket with two horizontal rows (rod, two bodies, a flared horn out 0.235 m past the box's side); raised equipment on its mast, drawn at every range (`turretCupola`) | 06 (1.7 : 1, chamfered outline), 07, 09, 12 (the back face: fans, ribs, horns) |
| 2A38M x 2 | trunnion turret-local (0, 0.86, -0.70) = 2.86 m up, at the module's back behind the side plates' middle; guns at x +/-0.80 (inboard of the banks), receivers 0.12 ... 1.04 m out along the bores on their cradle arms, the two bores 0.15 m apart (round 3) in bare dark steel with the rectangular muzzle frame round both, mouths 2.77 m ahead of the trunnion (2.07 m ahead of the ring); the Tunguska's 2A38M builder (`tunguskaM.ts` cannon2A38M) | 02, 13: the two barrels and the muzzle frame; 03, 12 |
| 57E6 banks x 2 | six containers r 0.085, columns x 1.20 / 1.42, rows y -0.19 / 0.08 / 0.35 (gun-local), z -0.08 ... 2.52 (turret z -0.78 ... 1.82: the domed covers 0.77 m past the drum's face); the cradle under them; the ribbed casing along the inner column; two thin bands round the six | 02, 03, 05, 08, 09, 14 |
| Side plates x 2 | round 3: fixed to the module at each bank's rear foot, upright while the banks elevate: 0.90 m long (turret z -1.15 ... -0.25) x 1.00 m tall (0.10 ... 1.10 m over the ring plane), 9 cm thick, outboard of the containers (x 1.525 ... 1.615), on a beam out from the platform, the recessed rounded panel in the outer face | 01, 07, 15 (the plate square and upright beside the elevated bank, its recessed panel) |

Design decisions:
- Round 2 (fix round 1, critics A and B): the banks pitch with the guns over the -5 ... +85 degree envelope (the real
  banks elevate on their own) about a trunnion moved to the module's back, so the banks swing up off it and never
  down: their lowest corner (the cradle's, 0.54 m from the axis) passes 0.32 m over the ring plane, 4 cm over the side
  plates' beams. Round 3: the search radar's box (1.36 m wide, wider than the guns' 1.35 m spacing) stands behind the
  guns' receivers at full elevation (its front face at z -0.876, the receivers' backs at -0.841), its horns further
  back; the fixed side plates stand 2 cm outboard of the containers through the arc.
- Round 3 (fix round 2, both A/B critics): the long slab on each bank is gone. Photographs 01, 07 and 15 show the side
  plate square and upright beside an elevated bank, so it is fixed to the module, not to the bank: 0.90 m long, 1.00 m
  tall, at the bank's rear foot (both round-2 critics; it reverses round 1's critic A, who read photograph 09's
  horizontal bank, where the plate lines up with the bank's lower casing, as one 2.4 m slab).
- The raised stern boxes start at z -2.58 / -2.74, aft of the 2.4 m the containers' covers reach from the ring.
- Not changed in rounds 2 and 3: the right rear box (B: 2.1 m) stays 1.4 m, photograph 07 showing the tall louvred block
  ending over the rearmost road wheel with a lower step and a separate low grille box ahead of it; the tracking drum
  keeps its 1.0 m (A: keep) and its second small window and chin housing (B, and round 3's P: the 0.13 m round cap at
  the drum's upper left as the vehicle faces, the housing under it); the guns keep the shared 2A38M's jackets
  (photographs 03, 12: no separate shroud beyond them).
- The radome is drawn in the fleet's pale finish (`turretCanvasPale`), the nearest material to its yellow.

Receipts (builder R, fix round 2 / round 3, chain r3 on the finished build; logs in
`~/cot-lanes/twin-aa-268-evidence/R/logs/r3-*.log`, earlier rounds' in `r2-*.log` and `f1-*.log`):
- `src/vehicles/profiles/gm352AirDefense.selftest.mjs`: PASS (spec = layout; rig seats, fire axes on bore faces in
  barrel groups 0/1, painted barrel stock on each fire axis, 0/1/0 firing order, 8 / 12 launch exits on dark covers in
  rig_gun, tube census, HIGH and LOW; the Pantsir's hull shell holds every Tunguska shell triangle, its extra ones all
  aft of z -2.5; guns and launchers at least 0.065 m off the hull (nothing within the probe's 6.5 cm reach) at every 2
  degrees of yaw at full depression, level, half and full elevation (keep 0.025; the Tunguska's nearest 0.037 m, an outer
  muzzle over the driver's hump at full depression); 0.022 m (Tunguska: the launcher box's arc seam and the receivers
  over the base) / 0.021 m (Pantsir: the containers past the fixed side plates) off their own turret through the arc in 3-degree steps,
  trunnion journals excepted).
- Roof pockets (`tools/roof-pocket-census.mjs --ids=tunguska_m,pantsir_s1`): 0 for both (the drum's chin closes the
  slot under the Tunguska's drum; the Pantsir's search antenna is raised equipment on its mast; its side plates' beams
  stand ahead of the ammunition boxes).
- Accessory contact (`.qa-dev/contactprobe.mjs`): 0 floating, 0 clipping on both (22 accessory pieces).
- Gun and launcher sweep (`densesweep.mjs`, the fleet's `gunHullProbe`, keep 0.025 m, recoil in battery and at 0.135 m):
  every 3 degrees of yaw and every 5 degrees of pitch over the whole arc (2,520 / 2,280 poses): none below the keep
  (Tunguska's nearest 0.038 m at yaw 339, -10 degrees: the outer muzzle over the driver's hump; the Pantsir nothing
  within the probe's 6.5 cm reach). The formal `tools/gun-depression-sweep.mjs` is left to the coordinator.
- Geometry digest (`.qa-dev/geodigest2.mjs` over 25 ids against the coordinator's baseline): the 23 neighbours of the
  shared code (BMP family, BMPTs, Leopard 1 family, TOS-1A, M6, ...) identical; only `tunguska_m` and `pantsir_s1` moved.
- Selftests naming the ids: vehicleAudioProfiles, ammunitionFlow, afvBalance, camoCatalogProductionIndices,
  nationWheelSets, vehicleFacets, guidedLauncherTubes (censuses tunguska_m 8, pantsir_s1 12), launcherOrigins and
  recoilRig PASS; fleetBalance fails only on x1_pioneiro / x1a2_carcara (cold-war/1/light penetration), not these ids.
- Typecheck: clean (TypeScript, unused symbols, oxlint).
- Posed renders (yaw / pitch 30 / top of the arc, 0 / full depression, +/-120 / +45): `~/cot-lanes/twin-aa-268-evidence/R/r3/f1_pose_*.png`;
  the nine views `R/r3/<id>_f1_*.png` (round 1's cameras and names; rounds 1 and 2 in `R/after/`, `R/r2/`).
- Not run here (coordinator): the combat-anatomy update and check, marking seats, interior fill, presentation anchors,
  auxiliary inventory, tank assets, the photographic packet, tank:release:check.

## Construction work order (registrar R0; done by builder R except the generated tables)

- Replace the placeholder in `src/vehicles/profiles/gm352AirDefense.ts` with the measured build; keep `src/vehicles/gm352AirDefenseSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
