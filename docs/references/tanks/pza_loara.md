# PZA Loara (`pza_loara`), run packet

## Current status

- IDs and display names: `pza_loara`, "PZA Loara" (`src/vehicles/tankLabels.ts`); fleet group `loara`.
- Updated: 2026-11-03 (release 269, builder P over the registrar R0's registration).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED PHOTOGRAPHIC BUILD (builder P). The fleet's PT-91 Twardy hull and running gear
  (`profiles/pt91Twardy.ts` `buildPT91TwardyHull`, a new export composed of the Twardy's own hull parts, called with its
  default-on options `erawa`, `deckFittings` and `rearDrums` off; `buildPT91Twardy` itself is unchanged) under the
  Loara's raised superstructure, box turret, guns, radars and dischargers (`profiles/loara.ts`), every spatial datum the
  spec reads drawn from one frame (`profiles/loaraFrame.ts`); the build section below has the numbers and the
  photographs they came from.
- Qualification status: native fixture `src/vehicles/profiles/loara.selftest.mjs` (both qualities); photographic
  qualification (a dated packet under `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`) is
  owed and is the coordinator's.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action (coordinator): register `loara.selftest.mjs`, then the generated tables for this id: combat
  anatomy (`npm run tank:anatomy:update` and `check`), marking seats, interior fill, presentation anchors, auxiliary
  inventory, tank assets; and the photographic packet.

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder P after the registrar): `src/vehicles/loaraSpecs.ts`, `src/vehicles/profiles/loara.ts`,
  `src/vehicles/profiles/loaraFrame.ts` (new), `src/vehicles/profiles/loara.selftest.mjs` (new), this packet.
- Shared builders extended with default-on options only (every sharing id byte-identical by digest, below):
  `profiles/t72b3X.ts` (`T72B3XOptions.deckFittings`, `rearDrums`), `profiles/pt91Twardy.ts` (`buildPT91TwardyHull` and
  its `PT91TwardyHullOptions`, composed of the Twardy's own hull parts; `sideScreen`'s `tiles`).
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

The Polish PZA Loara's third prototype at MSPO Kielce (2004, 2007): the PT-91 hull (six road wheels, the bare steel side
screens, no ERAWA tiles) raised by a welded box over its deck and fenders (armedconflicts.com: "box-shaped
superstructure on an elevated hull"), under the long box turret; the two 35 mm KDA in faceted housings on the turret's
flanks at the rear, elevating on large bearing discs (photo 01); the flat 3D search radar on its tall folding mast over
the guns' axis (raised in every photograph); the round Eagle tracking radar on the turret's front face with the
electro-optical head beside it; two banks of six smoke dischargers low on the flanks; in the Polish green, brown and
black. Photos 02, 04 and 05 give the right side from ahead, 03 the front right with the guns raised, 01 the left gun's
housing and bearing close up; the hull number "370" is on the glacis.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (commander, driver, gunner) | en.wikipedia "PZA Loara" |
| Mass | 45.3 t (en.wikipedia 45 t) | Army Recognition |
| Length / width | 6.67 m / 3.4 m | en.wikipedia |
| Height | 2.19 m, marked dubious on the page (not used) | en.wikipedia |
| Guns | two Oerlikon KDA 35 x 228 mm L/90, 550 rpm each; 1,385 m/s; 4 km against air targets | en.wikipedia; Army Recognition; valka.cz via search |
| Radars | a 3D search radar with IFF, 26 km, 64 targets; the Ericsson Eagle engagement radar (Mk 1 or Mk 2: sources differ) | Army Recognition; search results |
| Engine | S-12U at 850 hp (Army Recognition); S-1000 at 1,000 hp (en.wikipedia, the Loara-A listing) | |
| Speed / range | 60 km/h / 500 km (Army Recognition), 650 km (en.wikipedia) | |
| Production | one production unit and a few prototypes; the one used by Poland withdrawn 2013 | en.wikipedia |
| Gun arc | -10 to +85 degrees | armedconflicts.com (Cichy) |
| Width / ground clearance | 3.47 m / 0.47 m | pl.wikipedia; armedconflicts.com |
| Barrel | the KDA's 3.15 m (L/90), 675 kg a gun | armedconflicts.com |
| Load | 2 x 210 fragmentation rounds in a basket magazine, 20 armour-piercing a gun in external belt magazines (pl.wikipedia); 460 a barrel (armedconflicts.com, Cichy) | the game keeps the registrar's 40 + 640 |
| Chassis | a modified T-72M / PT-91: the driver moved to the left, stronger torsion bars, an APU at the rear, larger batteries; a raised hull | pl.wikipedia; armedconflicts.com |
| Turret | welded; the commander right, the gunner-operator left; 13 t with crew and ammunition | pl.wikipedia |
| Search radar | three-coordinate, a phased array scanning electronically in elevation, on a pylon at the rear, 60 rpm | pl.wikipedia |
| Smoke | two launchers of six grenades at the turret's front | pl.wikipedia |
| Optics | Iris thermal camera (Sagem), DL-1 laser rangefinder and KTVD-1 day camera (PCO), the commander's PSPD-1 panoramic periscope | pl.wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are builder P's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion; Poland's Twardy line, off the PT-91A Twardy on lane 1 (lane 2 carries the Twardy's run to the Sokół; a drop to lane 4 would cross the Ryś's run to the Zubr) |
| Class / role / status / era | spaa / scout (recon) / prototype / modern | one production vehicle and prototypes, no series |
| HP, engine, weight | 2,550 / 850 hp / 45.3 t | Army Recognition |
| Speed, reverse, traverse | 60 / 20 km/h (the Twardy's reverse) / 34 and 72 deg/s authored | |
| Gun arc | -10 / +85 degrees, 50 deg/s | not published: the Gepard's, the same Oerlikon-pattern twin 35 mm |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 640 rounds; 0.35 s | the Gepard 1A2's KDA rows and load (not published for the Loara) |
| Dimensions | hull 6.67 m (published); the build's envelope: overall 6.88 m (the PT-91's fenders end to end; the guns forward stay inside them), width 3.65 m (the side screens and the exhaust), tallest 5.47 m with the search radar raised (whips out) | en.wikipedia; the build (loara.selftest.mjs holds it, 3 %) |
| Fire axes | twin, gun-local x = +/-1.42 m, y = +0.16 m over the elevation axis, the brakes' faces 3.05 m ahead of it (3.10 m ahead of the hull origin) | the build (profiles/loaraFrame.ts) |
| Turret pivot | (0, 1.805, 0.0656): the T-72's ring station lifted onto the raised deck | the build |
| Gun pivot | (0, 0.70, -0.02) turret-local: the centre of the bearing disc on each flank (photo 01) | the build |
| Turret | welded body 2.24 x 1.25 x 3.35 m and the chin under the radar, 25/30 mm (chin 20/25) | the build; game tuning |
| Hull frame | the Twardy's final frame (the T-72B3 frame `fleetRenewalSpecs.ts` gives it), through `synchronizeLoaraFrame`, less its ERAWA plates and its deck plate, plus the raised hull's roof (40 mm), flanks (45), middle front plate (80), cheeks (40 roofs, 45 fronts), rear (45) and the bare 20 mm side screens (spaced); the turret ring's module lifted 0.348 m with the ring | the build; game tuning |
| Paint | spec coat and stock: `sig_pt91_twardy`, the PT-91 Twardy's Polish green, sand and black | no new paint |
| Marking | hull left anchor, number "370" (photo 02) | |
| Wheels / track | the Twardy's (`WHEEL_STANDARD_EXCEPTIONS`, donor pl01, not Poland's IFV wheel); its single-pin track (`trackPatterns.ts`) | |
| Audio | `diesel_v12_soviet` (the S-12U) | |
| View / camouflage | 455 m, 0.220 / 0.190 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/loara/` (comparison only; never shipped). The owner's photo is the trade-show view.

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [PZA Loara MSPO2004 PICT0150.JPG](https://commons.wikimedia.org/wiki/File:PZA_Loara_MSPO2004_PICT0150.JPG) | Pibwl | CC BY-SA 4.0 | 2004-09-02 |
| 02 | [Loara PICT0104.jpg](https://commons.wikimedia.org/wiki/File:Loara_PICT0104.jpg) | Pibwl | CC BY-SA 4.0 | 2007-09-03 |
| 03 | [PZA Loara MSPO2004 PICT0146c.jpg](https://commons.wikimedia.org/wiki/File:PZA_Loara_MSPO2004_PICT0146c.jpg) | Pibwl | CC BY-SA 4.0 | 2004-09-02 |
| 04 | [Loara Kielce.png](https://commons.wikimedia.org/wiki/File:Loara_Kielce.png) | Steifer | CC BY 3.0 | Sept 2007 |
| 05 | [PZA Lora Kielce.jpg](https://commons.wikimedia.org/wiki/File:PZA_Lora_Kielce.jpg) | Steifer | CC BY 3.0 | 2007 |

## Build (builder P, 269)

Frame: hull metres, ground y 0, +z forward, +x the vehicle's left; the turret is drawn turret-local (ring plane y 0 at
1.805 m, 0.0656 m ahead of the hull origin, the T-72's ring station), each gun gun-local about its elevation axis. Every
number below is a constant in `profiles/loaraFrame.ts`.

How the photographs were read: the camera of photo 02 was fitted (`~/cot-lanes/twin-aa-269-evidence/P/scripts/camfit.py`)
to the PT-91 hull's six road-wheel hubs, its sprocket and three track contacts (drawn positions from `t72b3X.ts`) at the
EXIF focal length (DiMAGE 7i, 42 mm equivalent: 1,735 px): 6.8 px rms. Through it the side screens' top reads 1.451 m
against the drawn 1.444. Points were back-projected onto their planes (`backproj.py`); ahead of the last road wheel the
fit stretches lengths (the front mudguard's tip reads 4.25 m against 3.52), so the front was read against the hull's own
features and photos 04, 05. The build was then rendered through the same camera and laid over the photograph
(`P/r3/blend02_r3.png` for the round that set the frame, `P/after/blend02_after.png` for the final build).

| Part | Numbers | From |
| --- | --- | --- |
| Hull and running gear | the fleet's PT-91 Twardy (the T-72B3 study's hull core, six road wheels, its single-pin track, the steel side screens, the dozer blade) through `buildPT91TwardyHull`, without the ERAWA tiles, the B3's deck fittings (under the raised deck) or its stern drums (the APU's place) | photos 02-05 (no tiles on the glacis or the screens); pl.wikipedia (APU at the rear) |
| Raised hull | one welded box over the deck and fenders, roof 1.80 m (0.36 m over the fender line), flanks 1.72 m out (5 cm inside the screens), from the rear plate (z -3.10) to the deck's edge (z 1.95); four access doors a flank | photo 02 through the fitted camera: the box's top edge 1.77-1.80 m from z -2.5 to 1.8; pl.wikipedia / armedconflicts.com ("raised hull") |
| Front | the middle's 45 degree plate from the deck's edge into the T-72 glacis (z 2.66); the cheeks over the front fenders on at full height to z 2.60, their 50 degree faces down to the fenders (z 3.07); the louvred intake on the right cheek; the hooded intake (0.54 m wide, lid 1.76 m) at the glacis' right corner; the driver's hatch and periscope block on the plate | photos 02, 04, 05 (the side boxes reach well ahead of the glacis' top edge; the hood beside the right cheek) |
| Turret body | 2.24 m wide, 3.35 m long (rear 1.10 m behind the ring, front 2.25 m ahead), roof 1.28 m over the ring (3.09 m over the ground), the long top edges and the rear corners chamfered; a chin 1.40 m wide and 0.46 m tall under the radar, to 2.55 m | photo 02 through the camera: rear 1.05-1.19 m behind the hull origin, roof 3.1-3.3 m, the front corner at the smoke dischargers' front |
| Elevation axis | 0.70 m over the ring, 0.02 m behind it; the bearing disc 0.40 m in radius on each flank, 2 cm off it | photo 01 (the disc 61 % of the housing's length behind its nose); photo 02 (the barrel's exit 2.66 m up) |
| Gun housings | 0.49 m wide (x 1.175-1.66), 0.63 m tall about the bore (y -0.15 to +0.48 on the axis), 0.53 m behind to 0.95 m ahead of the axis (hull z -0.48 to 1.00): an angular armoured box, flat inner and outer faces, a 0.14 m chamfer along the top outer edge, the tail tapered, a shoulder and a front face round the bore, a door on the outer face | photos 01, 02, 04; through the camera: z -0.48 to 1.0-1.23, y 2.36-3.00 |
| Bores and barrels | x +/-1.42 m, 0.16 m over the axis (2.67 m over the ground at rest); the KDA's 3.15 m L/90 barrel: a jacket, a clamp, the tapered tube, a 0.30 m multi-port brake (0.072 m radius, two port rings) whose face is the bore mouth, 3.05 m ahead of the axis (3.10 m ahead of the hull origin) | armedconflicts.com (3.15 m); photos 02, 04, 05 (the near brake beside the dish, inside the hull's length) |
| Tracking radar | the Eagle's radome on the body's front face: a drum 0.80 m across and 0.20 m deep, a 0.16 m dome, its centre 0.95 m over the ring (2.76 m) and 2.55 m ahead of it, the electronics body let into the front plate, the chin under it | photo 02 through the camera: 0.76-0.80 m across, centre 2.7 m up |
| Electro-optical head | beside the radome on the right: a bracket from the front plate, the sensor drum (0.34 m across) with two windows, the rangefinder's housing on top | photos 02, 03; pl.wikipedia (Iris, KTVD-1, DL-1) |
| Search radar | the mast 0.34 m square over the guns' axis (0.34 m behind the ring), the folding joint's housing 0.43-0.97 m over the roof, the azimuth drive, the array 2.00 x 0.95 x 0.10 m canted back 15 degrees, the RADWAR box on its back, its top 5.47 m over the ground | photo 02 through the camera: the mast 0.27 m behind the hull origin, the array's ends 2.01 m apart, its top 5.57 m (read where the camera is least sure); photo 04's mast-to-array ratio |
| Sights and hatches | the commander's PSPD-1 (right, 0.5 m tall, 1.15 m ahead of the ring), the gunner's sight head (left), two round hatches either side of the mast | photo 02 through the camera (the PSPD-1 at z 1.22 m, 3.17-3.70 m up); pl.wikipedia (commander right, gunner left) |
| Smoke dischargers | two banks of six 81 mm tubes, two rows of three fanned from outboard to ahead, on a bracket low on each flank 1.28-1.88 m ahead of the ring, under the depressed barrels | pl.wikipedia (2 x 6); photos 01, 02 |
| Roof and rear kit | a stowage tube along the roof's right rear edge, two radio whips (2.2 m, antenna seat role), a stowage box on the rear face | photos 02, 04 |

Not built: the folded travel position of the search radar (every photograph shows it raised); the driver on the left
(pl.wikipedia: the driver moved to the left): the base frame's driver and the shared internal-layout table keep him in
the middle, so the hatch is drawn over him; the hull's Polish camouflage is the Twardy's stock (no new paint).

Receipts run by builder P (2026-11-03, worktree `~/cot-lanes/twin-aa-269`, uncommitted over 915f4241bc; logs under
`~/cot-lanes/twin-aa-269-evidence/P/chain*/`): the fixture `profiles/loara.selftest.mjs` PASS at both qualities (the
guns 52.0 mm (high) and 54.3 mm (low) from the turret at worst, at -10 degrees; 65.0 mm from the hull at worst, yaw 180 at
-10 degrees; the envelope 6.878 x 3.648 x 5.471 m); the accessory contact probe 0 floating / 0 clipping;
`tools/roof-pocket-census.mjs` none (a 60 cm2 slot over the exhaust outlet, the census' only find on the first pass, is
filled by the heat shield); `tools/gun-junction-census.mjs` CLOSED (2 mouths, 3 poses); the geometry digest
(`.qa-dev/geodigest2.mjs`) of t72b3, t72m1_jaguar, pt91a_twardy, pt91m, t64bv1, t64bv_donbas, type96_72_long,
type96_80_feng and type96_72m_lei byte-identical to the registrar's (R0/digest-fleet-after.json), pza_loara moved
(82853e8dd4c1); typecheck clean in these files (the tree's errors are in `profiles/marksmanTurret.ts`, builder M's, mid
edit); the selftests naming the id (recoilRig, afvBalance, vehicleAudioProfiles, ammunitionFlow,
camoCatalogProductionIndices, nationWheelSets, trackPatterns, vehicleFacets) and two naming the PT-91 ids (tankIdAliases,
techTree) PASS. Not completed under the machine's load (150-200): `nationalModernization` (stopped at 43 min; it builds
on the B3's hull core, running gear and fenders, which the options do not touch) and `pt91mPendekarFidelity` (stopped
at 34 min); not run: the other selftests naming the PT-91 ids (t72JaguarRedesign, t72TrackFinish,
turretEraSurfaceSeating, fleetEraFinish, accessoryContact, markingSeatStability, ghillieSuit, auxiliaryPresentation,
mapQuality, body-height-parts, module-outside-share): those ids' geometry is byte-identical by the digest. `internalPlacement` fails on the
Marksmen's turret volumes (builder M's); run on pza_loara alone its sides, ring and volumes hold and its one overlap is the
engine and the transmission, which keep their unfitted boxes until the combat-anatomy update writes this id's row (the
PT-91's row fits them apart).

## Construction work order

- Done (builder P): the measured build on the base vehicle's own hull and running-gear builders; the spec's turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew boxes read from the build's frame; the clearance
  probe in the fixture.
- Owed (coordinator): register `profiles/loara.selftest.mjs` in the suite; the generated tables for this id (combat
  anatomy, `npm run tank:anatomy:update` and `check`; marking seats; interior fill; presentation anchors; auxiliary
  inventory; tank assets); the photographic packet registration; `pza_loara: []` in
  `nationalGunClearance.selftest.mjs`'s curves if the suite should hold it there too (the fixture already holds the
  hull at every 5 degrees of yaw).
