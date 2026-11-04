# Type 87 Self-Propelled Anti-Aircraft Gun (`type87_aw`), run packet

## Current status

- IDs and display names: `type87_aw`, "Type 87 Self-Propelled Anti-Aircraft Gun" (`src/vehicles/tankLabels.ts`); fleet group `type87`.
- Updated: 2026-11-03 (release 269, builder J after registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED BUILD (builder J). The fleet's Type 74 hull and running gear
  (`profiles/type74Family.ts`, called with two default-off options: the hull alone, and the enlarged hull's overhung
  stern) under the Type 87's welded turret (`profiles/type87.ts`), every shared datum in `profiles/type87Frame.ts`, which
  `type87Specs.ts` reads. `type74` and `stb1` digest byte-identical.
- Qualification status: native fixture `src/vehicles/profiles/type87.selftest.mjs` PASS (datums, crew, stern plates,
  envelope, both guns' sweeps). Photographic qualification (a dated packet under `docs/references/photos/`, registered in
  `tools/photo-reference-policy.mjs`) NOT RUN: owed with the generated tables.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269`, uncommitted.
- Current next action (coordinator): the changed-only regeneration for this id (combat anatomy, marking seats, interior
  fill, presentation anchors, auxiliary inventory, tank assets), the suite row for `profiles/type87.selftest.mjs`
  (`tools/selftest-suites.mjs`, `tools/selftest-tiers.mjs`, beside `profiles/gepard.selftest.mjs`), and the photographic
  packet.

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder J after the registrar): `src/vehicles/type87Specs.ts`, `src/vehicles/profiles/type87.ts`,
  `src/vehicles/profiles/type87Frame.ts`, `src/vehicles/profiles/type87.selftest.mjs`, this packet; default-off options in
  `src/vehicles/profiles/type74Family.ts` (`hullOnly`, `overhungSternZ`, the exported `TYPE74_HULL_STATIONS`).
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

The JGSDF Type 87 (87AW) at Camp Shimoshizu, 2018 (vehicle 96-5192; 96-5442 for the turret details 09-11), in the JGSDF
green and brown two-tone. The Type 74 hull and five-road-wheel hydropneumatic running gear under the boxy Type 87 turret:
a 35 mm KDA in an external mount on each turret side (long L/90 barrels with muzzle brakes, the feed housings), the
search radar on a tall rear post (the drum-backed dish), the tracking radar on the turret front, the optical sight and
periscopes, smoke dischargers. Photo 01 is the right side (radar up), 03-06 the front quarters, 07 the rear, 02/08 the
radars, 09-11 the turret rear.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (commander, driver, gunner) | en.wikipedia "Type 87 self-propelled anti-aircraft gun" |
| Mass | 38.0 t | en.wikipedia |
| Length / width | 7.99 m / 3.18 m | en.wikipedia |
| Height | 3.25 m radar retracted, 4.40 m erected | en.wikipedia |
| Guns | two Oerlikon 35 mm KDA (35 x 228 mm, Japan Steel Works licence), 550 rpm each; 310 AA + 20 AP rounds a gun | en.wikipedia |
| Muzzle velocity | 1,175 m/s HEI / SAPHEI, 1,385 m/s APDS | en.wikipedia |
| Gun arc | -5 to +85 degrees, 360 degrees traverse | en.wikipedia |
| Engine | Mitsubishi 10ZF22WT two-stroke air-cooled V10 diesel, 720 hp at 2,200 rpm | en.wikipedia |
| Speed / range | 53 km/h / 300 km | en.wikipedia |
| Radars | pulse-Doppler search (~20 km), dish tracking radar | en.wikipedia |
| Service | 1987; 52 built 1987-2002 | en.wikipedia |

## Registration numbers (combat rows are the registrar's; spatial datums builder J's, below)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; Japan's STB-1 to Type 10 line, off the Type 74 on lane 1 (lane 0 carries the Type 74's run to the Type 90, lane 2 the Hayate's to the Type 89) |
| Class / role / status / era | spaa / scout (recon) / service / cold-war | in service 1987, on the cold-war Type 74 |
| HP, engine, weight | 2,350 / 720 hp / 38 t | |
| Speed, reverse, traverse | 53 / 20 km/h (the Type 74's reverse) / 38 and 70 deg/s authored (the recon doctrine raises them as the 268 set's) | en.wikipedia |
| Gun arc | -5 / +85 degrees, 50 deg/s; the Type 74's traverse curve and hydropneumatic gun-laying dropped | en.wikipedia |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 620 rounds; 0.35 s | the Gepard 1A2's KDA rows (gepardSpecs.ts), the same gun; the published 620 + 40 load |
| SAM | none | |
| Fire control | 0.25 accuracy, 1.05 s aim | the Gepard's |
| Fire axes | twin, x = +/-0.94 m on the elevation axis; the bore mouths (the brakes' faces) 3.24 m ahead of it | "Build (builder J)" |
| Turret | central body, cheeks and fixed gun pods, 20/25 mm (aluminium turret) | "Build (builder J)" |
| Paint | spec coat and stock: Japan's Factory coat `service_type10` (the JGSDF two-tone of the Type 74 and Type 90) | no new paint |
| Marking | hull left anchor, number "87" (the Type 74 carries "74") | |
| Wheels / track | the Type 74's Type 10 face (`WHEEL_STANDARD_EXCEPTIONS`); its double-pin track (`trackPatterns.ts`) | |
| Audio | `diesel_two_stroke`, the Type 74's | |
| View / camouflage | 440 m, 0.230 / 0.200 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/type87/` (comparison only; never shipped). The owner's look is photo 01 (parade, right side, radar up).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) right side view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_right_side_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 02 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) searching radar & tracking radar right side view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_searching_radar_%26_tracking_radar_right_side_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 03 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) left front view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_left_front_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 04 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) left front view at Camp Shimoshizu April 29, 2018 02.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_left_front_view_at_Camp_Shimoshizu_April_29,_2018_02.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 05 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) front view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_front_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 06 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) front view at Camp Shimoshizu April 29, 2018 02.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_front_view_at_Camp_Shimoshizu_April_29,_2018_02.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 07 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) behind view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_behind_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 08 | [JGSDF Type 87 self-propelled anti-aircraft gun(96-5192) searching radar & tracking radar behind view at Camp Shimoshizu April 29, 2018.jpg](https://commons.wikimedia.org/wiki/File:JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5192)_searching_radar_%26_tracking_radar_behind_view_at_Camp_Shimoshizu_April_29,_2018.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 09 | [Detail of JGSDF Type 87 self-propelled anti-aircraft gun(96-5442) turret right rear view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:Detail_of_JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5442)_turret_right_rear_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 10 | [Detail of JGSDF Type 87 self-propelled anti-aircraft gun(96-5442) turret right rear view at Camp Shimoshizu April 29, 2018 02.jpg](https://commons.wikimedia.org/wiki/File:Detail_of_JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5442)_turret_right_rear_view_at_Camp_Shimoshizu_April_29,_2018_02.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |
| 11 | [Detail of JGSDF Type 87 self-propelled anti-aircraft gun(96-5442) turret left rear view at Camp Shimoshizu April 29, 2018 01.jpg](https://commons.wikimedia.org/wiki/File:Detail_of_JGSDF_Type_87_self-propelled_anti-aircraft_gun(96-5442)_turret_left_rear_view_at_Camp_Shimoshizu_April_29,_2018_01.jpg) | Hunini | CC BY-SA 4.0 | 2018-04-29 |

## Build (builder J)

### Camera model (photo 01)

Photo 01 (the right side, radar up) is read through one pinhole model: the five road wheels on the fleet Type 74's
1.01 m pitch give 205 px/m at the wheel plane; the two muzzles (the same point on each gun, 1.88 m apart across the
vehicle) put that plane 8.0 m from the lens (the far muzzle's offsets 0.824 of the near one's), so the turret's
centreline reads at 176 px/m and its flanks at 190-200; the horizon (the eye) stands at 790 px, 1.27 m. Widths come from
the telephoto front view (photo 05, 227-239 px/m), the rear block's from photo 07. The sprocket and idler then land
within 2 cm of the Type 74 build's, which checks the model. Side-by-side overlays: `~/cot-lanes/twin-aa-269-evidence/J/ph/pair01_*.png`.

### Numbers chosen (all in `profiles/type87Frame.ts`)

| Part | Number | From |
| --- | --- | --- |
| Hull | the Type 74's, its deck and sponsons run to z -3.95 (an overhung stern: vertical upper face to 1.10 m, the lower plate raked 0.40 m forward to the belly); 7.32 m against the Type 74's 6.77 | photo 01: the sponsons end 1.03 m behind the sprocket's axis (the Type 74's 0.17), the lower hull 0.63 m; ja.wikipedia "74式戦車の車体を拡大した新造車体" |
| Ring | the Type 74's (0, 1.60, 0.50) | the hull's own ring |
| Central body | 1.40 m wide, rear face 1.85 m behind the ring, nose 1.95 m ahead, roof 1.02 m over the ring (2.62 m) | photo 01: 695 / 1,418 / 533 px; photo 05: 808-1,135 px |
| Nose | bevelled top edge to 0.94 m, the upper plate leaning back 10 degrees to 0.40 m, the chin raked 28 degrees to 0.17 m; the front face 1.20 m wide (vertical edges chamfered) | photo 01: 535 / 650 / 695 px; photos 04, 06 |
| Cheeks | 2.28 m across the pair, 0.40 m tall, from the ring's line to 1.10 m ahead | photo 05: 700-1,245 px; photo 01: the dischargers' block 1,035-1,265 / 640-725 px |
| Gun pods | fixed (their front aspect is the same 0.60 x 0.65 m at 30, 75 and 90 degrees: photos 03-06); 0.60 m wide (0.69-1.30 m out), 1.18 m long, 7 degrees nose-up, octagonal with a broad top-outer chamfer, the tail drawn in | photo 05: 650-790 px; photo 01: 775-1,000 px, top 532-500, bottom 640-615 |
| Flank cover | a disc 0.44 m in radius at y 0.56, z -0.66, its lower half under the pod | photo 01: about 920/615 px |
| Elevation axis | (0, 0.90, 0.00) turret-local, on the bores at the pods' fronts; the cradle's drum (0.19 m) 3 cm in front of the pod's face | photo 01: the barrel line meets the pod face at 546 px |
| Bores | x +/-0.94 m (the pods' inner half) | photo 05: 745 / 1,165 px |
| Barrel | sleeve 0.08-0.60, jacket to 1.30, the L/90 tube to 3.00 with rings at 2.55 and 2.80, the brake to its face flange at 3.24 (the bore mouth), the v0 cage's three rods and end ring to 3.50 | photo 01 at 4x: brake 0.24 m, cage 0.26 m; the tips measure 3.39 m from the axis, 3 % under what 7.99 m needs: 3.50 m gives 7.95 (8.03 m to the tail lamps) |
| Tracking radar | pedestal 0.44 x 0.34 m to 1.86 m, the drum leaning forward on it, a covered dish 0.86 m across centred (0, 1.95, -1.16), canted up 26 degrees; electro-optical box (right) and cylinder (left) on its flanks | photo 01: 745-870 / 320-480 px; photo 05: 200 px; photo 06 |
| Search radar | a hinge between the rear boxes at (0, 1.12, -1.76), a box-section arm 0.34 x 0.22 m up and back to (2.18, -2.22), the upright and turntable, the antenna bar 1.50 x 0.26 x 0.30 m (radome forward) centred 2.66 m: its top at 4.39 m | photo 01: 700/510, 640/345 and 235 px (4.42 m); photo 05: 350 px across; the published 4.40 m |
| Rear | two stowage boxes 0.40 x 0.34 x 0.52 m either side of the hinge; the wire basket on the rear face's left; the whips on the pods' rear faces | photos 07, 09-11 |
| Roof | two hatches (0.28 m) at x +/-0.33, z -0.40; sight heads at the front edge; the ventilator post at -0.55 (the right), z 0.67 | photo 01 (the open lid at 975 px); photos 03, 05, 06 |
| Stern kit | the outlet grille across the upper stern, tail lamps on the sponsons' ends, two tow shackles on the lower plate, rubber mudflaps, a stowage box on each rear deck corner | photos 01, 07, 10 |

### Photo-matching notes

- Photo 01 (the owner's look): overlaid at the wheel plane and at the turret's flank scale; the hull's stern, the
  turret's rear face, nose, roof, cheek box, pod, flank cover and ventilator post land within 2-5 cm. The radars sit on
  the centreline, so in the flank-scale overlay they read 0.15-0.19 m higher than the photo's: the perspective, which
  the camera model accounts for.
- Photos 05/06 (front): the nose face between the two pods, the cheeks under them, the dish over the roof and the
  antenna bar above it, the post on the right.
- Photo 07 (rear): the central rear block with the basket on the left, the pods' rear ends with the whips, the arm as a
  single post, the stern grille between the sponsons' ends.
- Not modelled: the open hatch lid of photo 01 (the hatches are closed), the antenna's azimuth in photos 01 and 07 (it
  faces forward, as in photos 03-06), the step bracket and small hardware of photos 09-11, the tow cable along the deck.
- Photo wanted: a top or high three-quarter view of the roof (the hatch and periscope layout), and a side view with the
  guns at high elevation to confirm the pods do not pitch.

### Spec datums (type87Specs.ts)

- `turretPivot` the ring; `gunPivot` the elevation axis; `gunBarrel.lengthM` 3.24 (the brakes' faces); `gun.muzzles`
  x +/-0.94, y 0; `dims` 7.32 m hull, 7.99 / 3.18 / 3.25 m published.
- Turret plates: the central body, the two cheeks and the two fixed pods (20 / 25 mm, the registrar's aluminium-turret
  values), inner faces left out.
- Modules (turret-local): `optics` under the sight heads; `gun` the two receivers in their pods with the drums in front.
  Crew: the gunner (+x) and the commander in the central body under their hatches; the driver the Type 74's.
- The registration hook copies the Type 74's hull frame and carries the hull plates' stern vertices (z < -3.0, the
  tracks excepted) to the overhung stern.
- Combat rows unchanged from the registrar's.

### Receipts (builder J, 2026-11-03)

- `profiles/type87.selftest.mjs`: PASS (8.026 m long, 3.170 m wide, 4.390 m tall; the guns keep 30 mm from the turret
  over -5 to +85 degrees, and 25 mm from the hull at every 5 degrees of yaw and pitch).
- Whole-fleet digest for the shared builder: `type74` c3f05bb10c02:49926 and `stb1` 3d5ab2291bdd:49618, byte-identical to
  R0; `type87_aw` 98672ab479a3 (27,095 triangles; the placeholder's 22,133).
- Contact probe 0 floating / 0 clipping; roof pockets none; gun-junction census CLOSED.
- Selftests naming the id or beside the changed files: recoilRig, afvBalance, ammunitionFlow, nationWheelSets,
  trackPatterns, vehicleFacets, camoCatalogProductionIndices, vehicleAudioProfiles, japaneseCastTurrets,
  weldedShellSurfaces PASS; internalPlacement fails only on the Marksman ids (builder M's work in progress), not this id.
- Typecheck: no error in these files (the run's one finding was in another builder's file).
