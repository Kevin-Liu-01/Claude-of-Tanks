# 2K22M Tunguska-M (`tunguska_m`), run packet

## Current status

- IDs and display names: `tunguska_m`, "2K22M Tunguska-M" (`src/vehicles/tankLabels.ts`); fleet group `gm352AirDefense`.
- Updated: 2026-11-02 (release 268, registrar R0; measured build, builder R).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: BUILT (builder R, 2026-11-02; fix rounds 1 and 2 on the photo and A/B critics, 2026-11-03). The registrar's BMP-3 placeholder is gone: the measured GM-352
  chassis (`src/vehicles/profiles/gm352Chassis.ts`, shared with `pantsir_s1` as an option) under the 2K22M turret
  (`src/vehicles/profiles/tunguskaM.ts`); every datum the spec reads lives in one table,
  `src/vehicles/profiles/gm352Layout.ts`, read by the builders and by `src/vehicles/gm352AirDefenseSpecs.ts`.
- Qualification status: physical receipts in the build section below. Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is still owed:
  the as-built box is 8.08 x 3.25 x 3.38 m to the gunner's sight head (the search radar folded, round 2), 4.26 m to
  the whip's tip (hull 7.93 m; the stern stowage box stands 0.13 m proud of the plate).
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
canisters above and outboard of it, in the 2008 Moscow parade three-tone (07, 08): grey buff and near-black bands over
the olive.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 4 (commander, driver, gunner, radar operator) | Wikipedia "2K22 Tunguska" |
| Combat weight | ~34 t (the M1 ~35 t) | brief; Wikipedia (M1) |
| Length / width | 7.93 m / 3.24 m (M1: ~7.90 m / ~3.25 m) | brief; Wikipedia (M1) |
| Height | 3.36 m search radar folded, 4.02 m raised (M1: ~3.35 m / ~4.0 m); the build shows it folded (round 2), `dims.heightM` 3.38 | brief; Wikipedia (M1) |
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
| Fire axes | twin, x = +/-0.925 m in the gun frame (round 3: bores 0.15 m apart): each 2A38M's inner bore (barrel groups 0 and 1); the outer bores are drawn with their own dark mouths | builder R, gm352Layout.ts TUNGUSKA |
| Paint | stock `paint_tunguska_m` (Russian Three-Tone Woodland: grey buff `#a59e7f` and near-black `#2f3329` bands over olive `#5a5d3b`, `nato`, scale 0.9), spec coat the same recipe | the 2008 Moscow parade rehearsal photographs (07, 08); owner 2026-11-05: "tunguska and pantsir need camos" (was `national_ru`, plain green) |
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
| Hull | 7.93 m (z +/-3.965), sides +/-1.50, roof 2.00 m, sponsons' undersides 1.29 m, belly 0.45 m, lower hull +/-1.06 between the tracks; along each side the solid fender shelf (r3): its top sloping 30 degrees out and down from the hull side (1.36 m) to the lip (1.285 m at x 1.62, the published 3.24 m over both), the lip's face to the flat underside at 1.08 m (0.28 m thick at the side), four butt straps; over the bow (z 3.40 on) it sweeps down to a point at the nose's corner, its foot 0.97 m; rubber flaps behind the sprockets and under the bow ends | 02: roof 650 px (1.99 m), fender 803-858 px (1.08-1.33 m), joints at x 405/775/1165/1555, bow end dropping to 883 px (0.97 m) at the nose; 01, 05, 06: the bevelled shelf and its pointed bow end; published 7.93 x 3.24 m |
| Bow | upper glacis 36 degrees from the roof's front edge (z 3.15) to the nose edge (1.40 m), lower glacis 57 degrees to the belly at z 3.35 | 02, 05, 06, 13 |
| Stern | rear deck sloping from z -3.40 to the stern plate's top (1.84 m), vertical plate, sloped lower plate with four tow eyes, rubber flaps behind the sprockets | 03, 04 |
| Running gear | six road wheels r 0.34 m at z 2.43 ... -2.52 (0.99 m pitch), sprocket z -3.30 / 0.86 m / r 0.32, idler z 2.98 / 0.86 m / r 0.30, three return rollers, track 0.36 m on xc 1.29 | 02: wheel centres 390-1520 px, r 79 px; sprocket and idler hubs 905 px (0.87 m) |
| Hull fittings | the driver's hump front left (r3: 0.78 m wide, 0.34 m over the deck, its face raked 53 degrees with the 0.60 x 0.20 m windscreen in its frame and bars, the visor lid overhanging it) and his hatch; the equipment box front right (0.26 m over the deck) with its overhanging lid; the stencilled plate between them; the headlight pods on the deck's front corners (0.32 m wide, lamp r 0.075 under a hood); tow cable on the glacis; side access panels; right side's radiator grille and louvres; left side's long exhaust grille; engine-deck hatches and grille; stern door and stowage box | 01, 02, 05, 06 (the hump, its windscreen and the corner pods), 13 |
| Turret ring | hull (0, 2.00, 0.35) | 02 and 05 |
| Lower turret | broad oval base 2.76 x 2.94 m (lathe, semi-axes 1.38 / 1.47), centre 0.27 m ahead of the ring (turret z -1.20 ... 1.74), 0.30 m tall, sides leaning in, top edge rounded, 12 mm over the deck on its collar (r2) | 02: base 830-1450 px (z -0.93 ... 1.78), top 585 px (0.27 m over the roof); 05: front 1.71, ~0.33 m tall; 06, 09, 13: the wide round base |
| Upper body / radar housing | 1.60 m wide, z -1.30 ... 1.20, roof 3.02 m, the roof's front edge rounded down (0.22 m) onto the front plate (r2); housing 1.56 m wide, z -2.00 ... -1.20, top 3.10 m | 02: roof 400 px (3.08 m), front edge falling 405 -> 460 px; 03, 04: the housing's back |
| Search radar | folded for travel: drive head 0.60 x 0.30 m over the housing's back (z -2.55 ... -1.95, top 3.22 m) on the lattice ladder frame braced to the housing; the reflector plate 2.20 m across (r3: 70 % of the turret's 3.2 m over the launchers), 0.82 m deep, D-shaped, its tips curving down 25 degrees (0.26 m), 6 cm thick, hinged low in the head and folded 15 degrees down and back over the engine deck, eight triangular pockets on its ribbed back; raised equipment drawn at every range (`turretCupola`). Overall height is the gunner's sight head, 3.38 m | 01-06 (stowed), 03, 04 (spanning the turret as a crescent, tips down, the ladder frame), 02 (z -2.11 ... -2.94), 12-13 (the plate raised: its pockets); published 3.36 m stowed |
| Tracking radar | 0.76 m drum (r 0.38), 0.38 m deep, face 1.90 m ahead of the ring, centre 2.58 m, standing ahead of the body on a 0.50 m neck with its yoke arms and on the drive's chin from the base's foot, the face gently domed with its rim (r2) | 02: face 1485 px (1.93 m ahead of the ring), centre 517 px (2.57 m), 0.68-0.78 m tall in 02/05; 01, 06, 10 |
| Roof | commander's cupola front left, gunner's hatch and sight head front right (top 3.38 m), vision blocks, whip: the crew stations `internalLayoutRegistry.ts` spaaTunguska gives | 01, 02, 05; published 3.36 m (radar folded) |
| 2A38M x 2 | trunnion turret-local (0, 0.72, 0.18) = 2.72 m; guns at x +/-1.00, the two bores 0.15 m apart (r3) in bare dark steel (jacket 0.10 m, barrel 0.072 m), perforated cooling jackets (grooved lathe at HIGH), the rectangular muzzle frame round both barrels, mouths 2.03 m ahead of the trunnion (2.21 m ahead of the ring), receiver 0.92 m; one shared builder (`tunguskaM.ts` cannon2A38M) for both modules | 02: gun axis 485 px (2.71 m), muzzles 1550 px (2.21 m ahead of the ring); 12, 13: the two barrels and the muzzle frame |
| 9M311M launchers x 2 | one flat side box a flank, 1.40 m long (turret z -1.00 ... 0.40), 0.50 m tall (0.34-0.84 m over the deck), x 1.18 (fixed part from the body side 0.79) ... 1.60, flush outboard: its front part (gun-local z to 0.22) elevates with the containers, its back an arc r 0.40 m about the trunnion; its back part is fixed on the turret behind a concave arc r 0.43 m, so the box reads as one at rest; four containers r 0.10, two by two (x 1.29 / 1.49, y -0.20 / 0.02), z 0.05 ... 1.45 gun-local (covers 1.63 m ahead of the ring, 0.27 m behind the drum's face), two thin bands (r2) | 02: box 815-1150 px (z -1.00 ... 0.47), 455-580 px (0.29-0.84 m over the deck); 08, 09, 12: the 2x2 containers ahead of the box, ~1.4 m showing |

Design decisions:
- Round 2 (fix round 1, critics A and B): the search radar is the 2K22M's folding plate stowed, as photographs 01-06
  show it, not the M1's dish (09-11) nor the plate raised (12, 13); the overall height is therefore the published
  stowed 3.36 m (built 3.38 m, the gunner's sight head). The broad oval base, the drum standing forward on its neck,
  the one-piece flat launcher box with the containers ahead of it and the sloped fender follow the photographs above.
- The launchers pitch with the guns (the game's one elevation; the real racks elevate independently). The box's
  elevating part turns about the trunnion inside a 0.40 m arc; the fixed part's concave front stands 3 cm outside it,
  so the two never meet through -10 ... +87 degrees and the seam stays 3 cm at every pitch. The receivers' backs stay
  within 0.33 m of the pitch axis, over the base's top (0.305 m) at every elevation.
- The driver's and the right front boxes start at z 2.88, past the 2.29 m the containers' covers reach at any bearing.
- Round 3 (fix round 2, both A/B critics): the folded plate widened to 2.20 m with its tips drooping, the fender a solid
  30-degree shelf ending in a point at the nose, the driver's hump, the headlight pods and the two barrels a gun with
  their muzzle frame. Not done: raising the front third of the deck ~0.1 m (critic P only; photograph 02 does show a
  ~0.08 m step at z 1.65, but the turret's base sweeps to z 2.09 at 12 mm over the deck, so a raised front deck under
  it needs the turret raised with it, a ring change beyond this round).
- Not changed in round 2: road wheels (B: 0.76 m) stay 0.68 m, photograph 02's centre wheel measuring 150 px (0.66 m);
  the barrels (B: 0.15 m) stay 0.10 m over the jackets, photograph 12 measuring them against the 0.20 m containers, and
  the muzzle is photograph 12's brace and plain collar, with no perforated brake. The double road-wheel tyre (B) is the
  shared running gear's, not changed here.

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
