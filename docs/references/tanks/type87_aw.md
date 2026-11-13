# Type 87 Self-Propelled Anti-Aircraft Gun (`type87_aw`), run packet

## Current status

- IDs and display names: `type87_aw`, "Type 87 Self-Propelled Anti-Aircraft Gun" (`src/vehicles/tankLabels.ts`); fleet group `type87`.
- Updated: 2026-11-03 (release 269, builder J after registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED BUILD (builder J: 41da460953, the critic's fix round 97ecff5358, round 3 after the
  blind A/B uncommitted). The fleet's Type 74 hull and running gear (`profiles/type74Family.ts`, called with its
  default-off options: the hull alone, the enlarged hull's overhung stern, level sponsons, the driver's side, no glacis
  cable, the upper run's sag, no side lockers) under the Type 87's welded turret (`profiles/type87.ts`), every shared datum in
  `profiles/type87Frame.ts`, which `type87Specs.ts` reads. `type74` and `stb1` digest byte-identical.
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
  `src/vehicles/profiles/type74Family.ts` (`hullOnly`, `overhungSternZ`, `levelSponsonFrontZ`, `driverSide`,
  `glacisCable`, `trackSag`, `sideLockers`, the exported `TYPE74_HULL_STATIONS`).
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
| Hull | the Type 74's, enlarged: the overhung stern's face at z -3.88 with the basket and corner bins 0.10 m behind it (the underside stepping to a knee at -3.62 / 0.98 m, the lower plate to the belly at -3.16), level sponsons to 2.61, deep front fenders to 3.43; 7.35 m against the Type 74's 6.77 | photo 01: the rear end 1.03 m behind the sprocket's axis (the Type 74's 0.17), the lower hull 0.63 m, the side's top edge level to 1,480 px; photos 04, 06, 07; ja.wikipedia "74式戦車の車体を拡大した新造車体" |
| Ring | the Type 74's (0, 1.60, 0.50) | the hull's own ring |
| Central body | 1.40 m wide, rear face 1.85 m behind the ring, nose 1.95 m ahead, roof 1.02 m over the ring (2.62 m) | photo 01: 695 / 1,418 / 533 px; photo 05: 808-1,135 px |
| Nose | bevelled top edge to 0.94 m, the upper plate leaning back 10 degrees to 0.40 m, the chin raked 28 degrees to 0.17 m, the underside receding to 1.48 m; the front face 1.20 m wide (vertical edges chamfered) | photo 01: 535 / 650 / 695 px; photos 04, 06 |
| Cheeks | 2.28 m across the pair, 0.40 m tall, from the ring's line to 1.10 m ahead; four open smoke tubes on a 0.72 m bracket on each | photo 05: 700-1,245 px; photo 01: the dischargers' block 1,035-1,265 / 640-725 px |
| Gun pods | fixed (their front aspect is the same 0.60 x 0.65 m at 30, 75 and 90 degrees: photos 03-06); 0.60 m wide (0.69-1.30 m out), 0.61-0.66 m deep, the body 0.85 m long, 7 degrees nose-up, octagonal with a broad top-outer chamfer, the tail drawn in, then the front third tapering, mostly from below, to a 0.20 x 0.20 m face round the bore 0.11 m behind the axis, straight into the barrel's collar | photo 05: 650-790 px; photo 01: 775-1,000 px, top 532-500, bottom 640-615; photos 01, 04, 06 for the nose |
| Trunnion drum | a drum 0.88 m across and 0.06 m proud on each flank under the pod, its rim chamfered and a hub on its face, centred y 0.56, z -0.66 | photo 01: about 920/615 px, its lower half under the pod |
| Elevation axis | (0, 0.90, 0.00) turret-local, on the bores at the noses' tips; the barrel's collar (0.08 m) turning just ahead of each | photo 01: the barrel line meets the pods' fronts at 546 px |
| Bores | x +/-0.94 m (the pods' inner half) | photo 05: 745 / 1,165 px |
| Barrel | the square sleeve 0.00-0.50, jacket to 1.30, the L/90 tube to 3.00 with rings at 2.55 and 2.80, the brake to its face flange at 3.24 (the bore mouth), the v0 cage's three rods and end ring to 3.50 | photo 01 at 4x: brake 0.24 m, cage 0.26 m; the tips measure 3.39 m from the axis, 3 % under what 7.99 m needs: 3.50 m gives 7.95 (8.03 m to the tail lamps) |
| Tracking radar | pedestal 0.44 x 0.30 m under a head 0.64 m across to 2.06 m, a covered dish 0.86 m across centred (0, 2.01, -1.12), canted up 26 degrees; the sensor box (0.26 x 0.40 m) on the head's left, the cylinder (0.26 m across) on its right | photo 01: 745-870 / 320-480 px; photo 05: 200 px, the dish 1.0 m over the roof; photos 02, 06, 08 |
| Search radar | a hinge between the rear boxes at (0, 1.11, -1.80), a box-section boom 0.48 x 0.40 m at its root narrowing to 0.36 x 0.28 m, leaning back 25 degrees to (2.22, -2.32), a short upright and the turntable, the antenna 1.52 m across, 0.56 m deep and 0.33 m tall (a flat back and top running into a curved front, D-shaped ends, a feed box behind) from 2.46 to 2.79 m: 0.06 m over the dish's rim, its top at 4.39 m | photo 01: 700/510, 640/345 and 235 px (4.42 m); photos 02, 03, 05, 06, 08; the published 4.40 m |
| Rear | two stowage boxes 0.40 x 0.34 x 0.52 m either side of the hinge; the wire basket on the rear face's left; the whips on the pods' rear faces | photos 07, 09-11 |
| Roof | two hatches (0.28 m) at x +/-0.33, z -0.40; sight heads at the front edge; the ventilator post at -0.55 (the right), z 0.67; the side vents 0.32 x 0.40 m | photo 01 (the open lid at 975 px); photos 03, 04, 05, 06 |
| Hull kit | the raised mesh basket (eight bays, 0.38 m) between the lidded corner bins with the tail lamps, two tow shackles on the raked lower plate, rubber mudflaps behind the sprockets, two stowage boxes inboard on the rear deck; thin front fenders curving down over the idlers to end level with the glacis' nose, a thin lip and a short flap; flush stowage-panel outlines and a small louvred grille on each side band; the APU intake grille on the glacis' right | photos 01, 04-07, 10 |

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

### Fix round (blind photo critic 7/10, "instantly recognisable")

Each item re-checked against the photographs; the numbers are in `profiles/type87Frame.ts`.

| Critic item | Fix |
| --- | --- |
| 1. Search antenna too high, a round-ended pipe, its end too small; the boom thin and uniform | The antenna 0.04 m over the dish's rim (photos 03, 05, 06; the dish raised to 2.01 m, photo 05), a flat-faced slab 1.52 x 0.34 x 0.32 m under a flat top plate, flared end plates and a feed box on its back (photos 02, 08), top still 4.39 m; the boom 0.48 x 0.40 m at its root narrowing to 0.36 x 0.28 m (photos 02, 08) |
| 2. A drum between each housing and its barrel; the housing too shallow | The drum gone: each fixed pod ends in an angular wedge nose (the top falling a little, the bottom rising steeply to a 0.26 x 0.24 m face round the bore, photos 01, 04, 06), a small trunnion block (0.095 m) on the axis and a square sleeve 0.20 m tapering to 0.17 m; the pod 0.62-0.66 m deep (0.09 of the hull's length, photo 01) |
| 3. Tracking-radar fittings swapped and small | A head 0.64 m across on the pedestal; the sensor box (0.26 x 0.40 x 0.34 m) on its left (+x, photos 05, 08), the cylinder (0.26 m across, 0.30 m long, round end outboard) on its right (photos 01, 02, 08); the old leaning drum on the pedestal was this cylinder |
| 4. Smoke dischargers a closed box | Open tubes (a rim round a dark bore) on a 0.72 m bracket standing off the cheek on two plates (photos 01, 04); the cheek block itself is in the photos and stays |
| 5. Side vent too small | 0.32 x 0.40 m, five blades (photos 01, 04) |
| 6. Rear: a flat grille; deck boxes at the corners | The upper stern a raised mesh basket 0.38 m tall in eight bays between two lidded corner bins (photo 07), the tail lamps on the bins; the deck boxes inboard at +/-0.74 m (photos 01, 07); the overhung stern's underside steps up to a knee 0.63 m behind the sprocket before the lower plate (photo 01: grass under the overhang) |
| Hull: wedge nose | `levelSponsonFrontZ` 2.61: the sponsons level at the deck to their square fronts (89 % of the length, photo 01), the lamp boxes on them at the deck, the central glacis between them |
| Hull: no deep front fenders | Fender plates from the sponsons' fronts to 3.43 m with a 0.20 m lip ahead of the tracks and rubber flaps under it (photos 04, 06) |
| Hull: upper run sagging | `trackSag` 0.015: nearly straight, 0.2 m over the wheels (photos 01, 04) |
| Hull: glacis tow cable | `glacisCable: false` (no photo shows it) |
| Hull: driver on the right; grille on the front deck | `driverSide` +1: the hatch and periscopes on the left (photos 03, 05), the driver's seat and the hull radio moved with them; the APU intake grille on the glacis' right (photo 06, ja.wikipedia) |

Interior (spec): the ready rounds and the twin belt feed authored in the central body behind the crew (the layout's
turret ammunition and feed; the sketched ones crossed the crew), the Type 74's hull ammunition dropped, a transmission
authored behind the engine in the enlarged stern (the sketched one sat inside the engine).

#### For a later Type 74 pass (not changed: `type74` stays byte-identical)

- The Type 74's driver's hatch, periscopes and driver's seat stand at -x, the vehicle's right by `vehicleSide.ts`; its
  packet records the driver front left (authored in the old program frame). The Type 87 takes `driverSide` +1.
- Whether the Type 74's sponsons also run level to its lamp boxes as the Type 87's do (the build slopes them with the
  glacis, from the owner's STB-1 model): no Type 74 photograph in this lane to settle it.
- Not Type 74 defects: the sagging upper run (its packet: no return rollers, dead track sag) and the glacis tow cable
  (its NDA photographs) are the Type 74's own; only the Type 87 turns them off.

### Round 3 (blind A/B: round 2 beat round 1 in all nine views, 7/10 against 5)

| Judge's item | Fix |
| --- | --- |
| 1. Pods: a short pyramid nose and a skinny sleeve; a large round drum under each pod | The pod's front third (0.44 m) tapers, mostly from below, straight into the barrel's collar (photos 01, 04); the trunnion block and the square sleeve gone. The drum under each pod is real (photo 01: 0.46 m radius about 920/615 px, its lower half below the pod); it was there as a plain 6 cm disc and now has a chamfered rim and a hub (a 0.12 m drum roofed a see-through pocket over the cheek in the roof-pocket census, so it stays 6 cm proud) |
| 2. Antenna a billboard; the arm leans 17 degrees; the radar heights | The antenna 0.56 m deep and 0.33 m tall, a flat back and top running into a curved front, D-shaped ends (photos 01, 02, 08); the boom leans back 25 degrees (photo 01) to a short upright. Heights checked against the photo 01 camera model: the antenna's top reads 4.42 m there (the published 4.40 m) and the dish's centre 1.95 m over the ring (photo 05: 2.03 m); kept at 2.79 m and 2.01 m, the antenna's foot 0.06 m over the dish's rim (photos 03, 05, 06). The judge's overlay is scaled at the wheels, where centreline parts 1.3 m deeper read 7 % large in photo 01 |
| 3. Front fenders are blocks | Thin fender plates curving down from the sponsons' fronts over the idlers to end level with the glacis' nose (0.99-1.00 m), a 0.07 m lip and a 0.09 m flap (photos 04-06), clear of the track's wrap round the idler |
| 4. Turret front too far forward, a bulging chin | Under the photo 01 camera model the nose's front face projects to 1,413 px against the photo's 1,415-1,418 px: the position holds (the wheel-scaled overlay draws the nose, 0.6 m deeper than the wheels, 0.16 m forward). The chin's underside now recedes to 1.48 m (1.60) |
| 5. Side band | `sideLockers: false` drops the Type 74's two raised lockers; flush panel outlines (0.78 and 0.63 m long) and a small louvred grille on each side band, where photo 01 shows them |
| 6. Side mudflap low | The deep front lip and its 0.22 m flap are replaced (item 3); the rear flaps hang from the sponson's floor as before |

### Receipts (round 3, builder J, 2026-11-04)

- `profiles/type87.selftest.mjs`: PASS (8.016 x 3.170 x 4.390 m; the guns keep 21 mm from the turret, closest at 63
  degrees, and 25 mm from the hull at every 5 degrees of yaw and pitch).
- Digest: `type74` c3f05bb10c02:49926 and `stb1` 3d5ab2291bdd:49618 byte-identical; `type87_aw` af780f2ef170 (28,345
  triangles).
- Contact probe 0 floating / 0 clipping; roof pockets none (a 0.12 m drum roofed two pockets over the cheeks, 468 cm2;
  the drum stays 6 cm proud); gun-junction census CLOSED; internalPlacement on `type87_aw` clean.
- recoilRig, japaneseCastTurrets, weldedShellSurfaces PASS; typecheck clean.
- Renders: `~/cot-lanes/twin-aa-269-evidence/J/r3/` (11 views, low quality, the fixed side and its photo 01 overlays).

### Receipts (fix round, builder J, 2026-11-03)

- `profiles/type87.selftest.mjs`: PASS (8.016 m long, 3.170 m wide, 4.390 m tall; the guns keep 35 mm from the turret
  over -5 to +85 degrees and 25 mm from the hull at every 5 degrees of yaw and pitch; the driver's side, the antenna's
  0.04 m over the dish and every stern vertex of the hull plates checked).
- Digest: `type74` c3f05bb10c02:49926 and `stb1` 3d5ab2291bdd:49618 byte-identical; `type87_aw` a569ca8d502d (28,251
  triangles).
- Contact probe 0 floating / 0 clipping; roof pockets none (a first pass left a 14 cm pocket under each pod's front over
  the cheek; the pods' undersides now stand clear of the cheeks' tops); gun-junction census 0 gaps.
- internalPlacement restricted to `type87_aw` (a copy of the selftest's checks for this id): sides, ring, volumes and
  overlaps clean (before the authored turret ammunition, feed and transmission: gunner and commander inside the
  sketched feed, the sketched transmission inside the engine).
- recoilRig, internalLayoutRegistry, japaneseCastTurrets, weldedShellSurfaces, ammunitionFlow PASS; typecheck clean.
- Renders: `~/cot-lanes/twin-aa-269-evidence/J/r2/` (11 views, low quality, the fixed side and its photo 01 overlays).

### Receipts (first build, builder J, 2026-11-03)

- `profiles/type87.selftest.mjs`: PASS (8.026 m long, 3.170 m wide, 4.390 m tall; the guns keep 30 mm from the turret
  over -5 to +85 degrees, and 25 mm from the hull at every 5 degrees of yaw and pitch).
- Whole-fleet digest for the shared builder: `type74` c3f05bb10c02:49926 and `stb1` 3d5ab2291bdd:49618, byte-identical to
  R0; `type87_aw` 98672ab479a3 (27,095 triangles; the placeholder's 22,133).
- Contact probe 0 floating / 0 clipping; roof pockets none; gun-junction census CLOSED.
- Selftests naming the id or beside the changed files: recoilRig, afvBalance, ammunitionFlow, nationWheelSets,
  trackPatterns, vehicleFacets, camoCatalogProductionIndices, vehicleAudioProfiles, japaneseCastTurrets,
  weldedShellSurfaces PASS; internalPlacement fails only on the Marksman ids (builder M's work in progress), not this id.
- Typecheck: no error in these files (the run's one finding was in another builder's file).
