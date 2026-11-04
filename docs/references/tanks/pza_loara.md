# PZA Loara (`pza_loara`), run packet

## Current status

- IDs and display names: `pza_loara`, "PZA Loara" (`src/vehicles/tankLabels.ts`); fleet group `loara`.
- Updated: 2026-11-04 (release 269, builder P over the registrar R0's registration; photo-critique round 3).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED PHOTOGRAPHIC BUILD (builder P). The fleet's PT-91 Twardy hull and running gear
  (`profiles/pt91Twardy.ts` `buildPT91TwardyHull`, a new export composed of the Twardy's own hull parts, called with its
  default-on options `erawa`, `deckFittings`, `rearDrums` and `frontMudguards` off; `buildPT91Twardy` itself is
  unchanged) under the
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
  `profiles/t72b3X.ts` (`T72B3XOptions.deckFittings`, `rearDrums`, `frontMudguards`), `profiles/pt91Twardy.ts`
  (`buildPT91TwardyHull` and its `PT91TwardyHullOptions`, composed of the Twardy's own hull parts, `frontMudguards`
  passed through; `sideScreen`'s `tiles`).
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
| Fire axes | twin, gun-local x = +/-1.42 m, y = +0.16 m over the elevation axis, the brakes' faces 3.30 m ahead of it (3.10 m ahead of the hull origin) | the build (profiles/loaraFrame.ts) |
| Turret pivot | (0, 1.805, 0.0656): the T-72's ring station lifted onto the raised deck | the build |
| Gun pivot | (0, 0.70, -0.27) turret-local: the centre of the bearing disc on each flank (photo 01) | the build |
| Turret | welded body 2.24 x 1.25 x 3.35 m and the chin under the radar, 25/30 mm (chin 20/25) | the build; game tuning |
| Hull frame | the Twardy's final frame (the T-72B3 frame `fleetRenewalSpecs.ts` gives it), through `synchronizeLoaraFrame`, less its ERAWA plates and its deck plate, plus the raised hull's roof (40 mm), flanks (45), middle front plate (80), cheeks (40 roofs, 45 fronts), rear (45) and the bare 20 mm side screens (spaced); the turret ring's module lifted 0.348 m with the ring; the power pack authored as the PT-91's anatomy row fits it (the engine ahead of a transmission across the stern); the driver 0.45 m left of the middle | the build; game tuning |
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
(`P/r1/iter3/blend02_r3.png` for the round that set the frame, `P/after/blend02_after.png` for the first build,
`P/r2/blend02_r2.png` and `P/r3/blend02_r3.png` for the critique rounds). Round 3 also read the front against the
radome: from the radome's and the brakes' readings the fit stretches lengths ahead of z 2.03 m by about 1.43, and the
head's parts were placed on their offsets from the radome in the photograph.

| Part | Numbers | From |
| --- | --- | --- |
| Hull and running gear | the fleet's PT-91 Twardy (the T-72B3 study's hull core, six road wheels, its single-pin track, the steel side screens, the dozer blade) through `buildPT91TwardyHull`, without the ERAWA tiles, the B3's deck fittings (under the raised deck) or its stern drums (the APU's place) | photos 02-05 (no tiles on the glacis or the screens); pl.wikipedia (APU at the rear) |
| Raised hull | one welded box over the deck and fenders, roof 1.80 m (0.36 m over the fender line), flanks 1.72 m out (5 cm inside the screens), from the rear plate (z -3.10) to the deck's edge (z 1.95); six latched stowage boxes a flank on the fender shelf (round 3: lengths 0.42-0.92 m, lids 1.60-1.75 m, some falling outward, 0.10-0.13 m deep, out 2-5 cm past the screens; a gap over the left exhaust); a raised box at the right rear corner (fix round) | photo 02 through the fitted camera: the box's top edge 1.77-1.80 m from z -2.5 to 1.8; photos 01, 02, 04, 05 (the boxes, the corner box); pl.wikipedia / armedconflicts.com ("raised hull") |
| Front | the middle's 45 degree plate from the deck's edge into the T-72 glacis (z 2.66); the cheeks over the front fenders on at full height to z 2.60, their 50 degree faces down to the fenders (z 3.07); on the right cheek a tall grille box out past the screens (z 1.98-2.62, lid 1.76 m, its front falling at 48 degrees, an eight-slat louvre 0.32 m tall; round 3); a big curved mudguard shell over the front of each track (round 3: from under the cheek level at 1.47 m over the side screen's front end, rolled down ahead of the track to a lip 0.84 m up at z 3.59, its outer side down to 0.86 m, 5 mm into the screen; the B3's flat bent plate left out by `frontMudguards: false`); the hooded intake (0.54 m wide, lid 1.76 m) at the glacis' right corner; the driver's hatch and periscope block on the plate 0.45 m left of the middle over his seat (fix round) | photos 02, 04, 05 (the side boxes reach well ahead of the glacis' top edge; the hood beside the right cheek; the grille box; the shells' tops at the side screens' height, rolling down to about the idler's centre); pl.wikipedia (the driver moved left) |
| Turret body | 2.24 m wide over its upper wall, 3.15 m long (rear 0.90 m behind the ring, front 2.25 m ahead), roof 1.28 m over the ring (3.09 m over the ground); a vertical upper wall over a lower skirt flaring 0.14 m out, the break 0.74 m over the ring (57 %) with a weld along it, the skirt from just ahead of the bearing discs to the front (the wall straight beside the discs); on the left, a tall louvred door on the upper wall (round 3: 0.36 x 0.43 m, fourteen slats, hinged ahead, z 1.15-1.51 over the dischargers' rear end) and a six-slat panel on the skirt under and behind it (0.41 m long, 0.54 m up the skirt, against the dischargers' box); the low front block under the radar's mount (round 3: its top 0.46 m over the ring, from 0.66) (fix round: the skirt, the break, the left louvres; the rear 0.20 m forward) | the photo-02 camera, the build laid over the photograph (P/r2/blend02_r2_turret.png): the drawn roof on the photo's roof line along its length, the rear 0.83 m behind the hull origin; photos 01-03 (the break 55-60 % up, the skirt, the left door and louvres; photo 01 places the door and panel on the dischargers' rear end); photos 02, 04 (the light front block under the dark mount, its top 0.69 m under the radome's centre on the radome's scale) |
| Elevation axis | 0.70 m over the ring, 0.27 m behind it (fix round: 0.02 m before); the dark bearing ring 0.40 m in radius on each flank, 2 cm off it, showing 0.08 m behind the pod and 0.28 m under it (round 3) | photo 01, the close side view at 104 mm: the ring 0.81 m across, its centre 0.46-0.61 m ahead of the turret's rear edge by the scale taken; photo 02 through the camera: the ring's lower edge 2.10-2.12 m up, the barrel's exit 2.61-2.66 m up |
| Gun pods | round 3: a square-cut rear half and a long faceted front half; 0.49 m wide (x 1.175-1.66); the outer face 0.54 m tall (0.42 m over the axis to 0.12 m under it, 0.43 of the turret wall) over a broad bevel, the top rising inboard to a ridge 0.56 m over the axis; the rear half 0.80 m (its rear 0.32 m behind the axis, hull z -0.52, 0.31 m ahead of the turret's rear, its edges chamfered), the front half tapering 0.72 m to the barrel's exit 1.20 m ahead of the axis (hull z 1.00); the bore half way down the outer face; the door on the rear half's outer face. The tail stays inside 0.68 m of the axis and swings beside the straight wall | the photo-02 camera (the pod in the fit's sound range): the rear corner at hull z -0.49 to -0.51, the outer face's top and bottom edges at 2.93 and 2.37-2.42 m, the dark upper facet 3.10 m up, the square-cut half's end near z 0.50, the barrel's exit at z 1.00; the judge's ratio read the pod's end at 45 % of the turret's length where the camera puts the exit at 58 % and the square-cut half's end at 37 %, and the camera is kept; the round-2 critic's 'rear flush with the turret's' gives way to the camera's 0.31 m and the ring behind it (photos 01, 02) |
| Bores and barrels | x +/-1.42 m, 0.16 m over the axis (2.67 m over the ground at rest); the KDA's 3.15 m L/90 barrel: a jacket, a clamp, the tapered tube, a large perforated brake (round 3: 0.40 m long, 0.088 m in radius, 1.7 times the tube, two rows of four rectangular ports, from 0.30 m and 0.072 m) whose face is the bore mouth, 3.30 m ahead of the axis (3.10 m ahead of the hull origin, unchanged) | armedconflicts.com (3.15 m); photos 02, 04, 05 (the near brake beside the dish, inside the hull's length; the brake about twice the barrel across and 0.4-0.5 m long) |
| Tracking radar | round 3 (the raised tracker head and its cubes gone): the Eagle's radome 0.88 m across (0.7 of the turret's height), its centre 0.20 m under the roof line and 2.60 m ahead of the ring (kept: the judge reads its height and reach right); one dark mount on the low front block: a slab under the radome (0.84 m wide, to 0.655 m), a neck behind it up to the radome's top (0.48 m wide) and a block under the camera drum; a box on the radome's back (0.42 x 0.18 x 0.38 m, to 1.68 m) | photos 02, 04 (dark under the radome down to the light block, up under the drum and behind the radome); the photo-02 camera against the radome: the boxes' tops 0.54-0.56 m over its centre, the mount's foot 0.56 m under it; photos 04, 05 and the critic for the radome (round 2) |
| Electro-optical head | round 3: the large round camera drum across the turret beside the radome on the right and behind its face (0.52 m across, 0.6 of the radome; 0.44 m long, x -0.78 to -0.34, its centre 1.16 m over the ring and 2.32 m ahead of it, its rear let into the body's front face), a rim round its outer end, its lens (0.17 m across) forward beside the radome's rim; a two-tier sensor box perched on its crest (0.40 x 0.14 x 0.36 and 0.34 x 0.13 x 0.30 m) to 0.38 m over the roof, two windows on the upper tier | photos 02, 03, 04 (the drum two-thirds of the dish across by the judge, 0.6-0.66 on photo 03, 0.45-0.5 on photos 02, 04; its end face and lens; the box on it); the photo-02 camera against the radome: the drum's centre 0.08-0.13 m over the radome's and 0.24-0.37 m behind its face, the sensors 0.38 m over the roof (the round-2 ratio from photos 04, 05 put them 0.50 m; the camera is kept); pl.wikipedia (Iris, KTVD-1, DL-1) |
| Search radar | round 3: a stack of boxes over the guns' axis (0.34 m behind the ring): a base 0.56 m, the lower column 0.46 m square, a ledge 0.64 m, the middle box 0.58 m (0.45-0.89 m over the roof) with a box on its right flank and four ribs on its face, the upper housing 0.50 m with a box on its left, a neck under the azimuth drive (from a 0.34 m column and a 0.56 m joint housing); the array 2.00 x 0.95 x 0.10 m canted back 15 degrees, a deep housing on its back (1.00 x 0.50 x 0.32 m, half the array's width) carrying the RADWAR plate (fix round); its top 2.38 m over the roof, 5.47 m over the ground, kept | the photo-02 camera: with the drawn turret roof on the photo's roof line along its length and the mast in the fit's sound range, the array's top reads 5.45-5.57 m; lowered 0.30 m for the critic, the drawn array sat 0.28 m under the photograph's (P/r2/blend02_r2_turret_lowered_radar.png); the distant photos' 1.40-1.53 turret heights are ratios that lean on the turret height and the mast's greater depth; the photo-02 camera for the stack (its widths and levels laid over the photograph, P/r3/blend02_r3_turret.png); the judge (the stack half the turret's height across) |
| Sights and hatches | the commander's PSPD-1 (right, 0.68 m tall, 1.15 m ahead of the ring, its window over the sensor boxes), the gunner's sight head (left, 0.62 m out, clear of the tracker head), two round hatches either side of the mast | photo 02 through the camera (the PSPD-1 at z 1.22 m, 3.17-3.70 m up); pl.wikipedia (commander right, gunner left) |
| Smoke dischargers | round 3: two blocks of six 81 mm tubes 0.30 m long and 0.11 m across (2.7 diameters, from 0.20 m), two rows of three at 0.30 m on a deep mounting box (0.12 m out, 0.24 m up the skirt) 1.32-2.16 m ahead of the ring (0.84 m, 27 % of the turret's length; the group with its tubes 29 %), pointing out, up and ahead, outboard of and under the depressed barrels | pl.wikipedia (2 x 6); photos 01-05; the photo-02 camera (the box's rear 1.45-1.49 m ahead of the ring, its front at the turret's corner) |
| Roof and rear kit | a stowage tube along the roof's right rear edge; two radio whips (2.2 m, antenna seat role), one beside the radar's mast behind its housing and one by the tracker head on the right (fix round); a stowage box on the rear face | photos 02-05 |

Not built: the folded travel position of the search radar (every photograph shows it raised); the T-72 road wheels'
ribbed, holed face (photo 02): the wheel face is the shared nation wheel set's (`nationWheelSets.ts`, donor pl01, the
Twardy's), left for a fleet pass; the hull's Polish camouflage is the Twardy's stock (no new paint). The driver now sits
left of the middle (his crew box, hatch and periscopes on this id's own spec); the shared internal-layout table still
names his station frontCenter (its side check skips centre stations): frontLeft there is the coordinator's.

Receipts run by builder P, first build (2026-11-03, worktree `~/cot-lanes/twin-aa-269`, uncommitted over 915f4241bc; logs under
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

Fix round (2026-11-03/04, after a blind photo critic's 6/10: "the layout is right, but it reads as a simplified
stand-in"; renders and receipts under `~/cot-lanes/twin-aa-269-evidence/P/r2/`). Changed: the radome on a raised tracker
head with its sensor boxes at the front of the roof, 0.88 m across and higher, over a longer low front block; the gun
pods as tall angled boxes with a deep lower body, the bore near the top of the pointed front, the rear flush with the
turret's rear corner (the elevation axis 0.27 m behind the ring, the turret's rear 0.20 m forward, both from photo 01
and the photo-02 camera); the turret's lower skirt and break line, the left side's louvred door and skirt louvres; the
smoke dischargers as a neat block of six on a plate on the skirt; latched bins along both fenders and a raised box at the
right rear corner; the whips beside the mast and by the tracker head; the deep RADWAR housing; the driver 0.45 m left;
the power pack, the turret magazine and the belt feeds authored. Kept on the photo-02 camera against the critic: the
search radar's height (5.47 m; at 0.30 m lower the drawn array sat 0.28 m under the photograph's). Left for a fleet
pass: the T-72 road wheels' ribbed, holed face (the shared nation wheel set).

Receipts, fix round (on the final files; logs under `P/r2/receipts/` and `P/r2/receipts2/`): `loara.selftest.mjs` PASS
at both qualities (the guns 29.1 mm from the turret at worst, at -10 degrees; 65.0 mm from the hull at worst, yaw 180 at
-10 degrees; the envelope 6.878 x 3.652 x 5.471 m); the contact probe 0 floating / 0 clipping; the roof-pocket census
none; the gun-junction census CLOSED (2 mouths, 3 poses); the digest of the nine PT-91/T-72B3-hull ids byte-identical to
R0's, pza_loara moved (2b6b0c9ebcb9); typecheck clean (TypeScript 7, no unused symbols, oxlint); `internalPlacement`
on pza_loara alone (`P/scripts/placement_loara.mjs`, the selftest's fleet checks on this id): sides, ring, volumes
and overlaps all empty, once the power pack, the turret magazine and the belt feeds are authored.

Round 3 (2026-11-04, after a blind A/B against the photographs: the round-2 build beat round 1 in all nine views, 5/10;
renders and receipts under `~/cot-lanes/twin-aa-269-evidence/P/r3/`, the round-2 against round-3 pairs
`P/r3/pair_r2_vs_r3_*.png`, the photographs beside the matched views `P/r3/pair_photo_vs_r3_p0*.png`, the build over
photo 02 `P/r3/blend02_r3.png` and `blend02_r3_turret.png`). Changed, worst defect first: the tracking head (the raised
platform and its cubes gone) as the radome and the large camera drum on one dark mount over the low front block, a
two-tier box on the drum, a box on the radome's back; the gun pods as a square-cut rear half and a long tapering front
half, their rear 0.31 m ahead of the turret's and their underside 0.24 m higher, so the dark bearing ring shows behind and
under them;
curved front mudguard shells over the tracks in place of the B3's flat bent plates (`frontMudguards: false`, a new
default-on option of the shared builders); the search radar's mast as a stack of boxes 0.46-0.64 m across; the smoke
tubes 0.30 m long on deep boxes 0.84 m along the skirt; the left flank's tall fourteen-slat door and the six-slat skirt
panel under it, 0.41 m long; brakes 0.40 m long and 0.176 m across with two rows of ports; varied, deeper stowage boxes
and a tall grille box with a sloped front on the right cheek. Kept on the photo-02 camera against the judge's ratios:
the pods' nose at the barrel's exit, hull z 1.00 (the judge read the pod's end at 45 % of the turret's length; the
camera puts the exit at 58 % and the square-cut half's end at 37 %), the ring's size and the elevation axis, the
sensors 0.38 m over the roof, the radome where the judge reads it right. The judge's own measures were taken for the
drum (0.6 of the radome, between the judge's two-thirds and the photographs' 0.45-0.66), the head's height (the block's
top to the sensors 0.96 of the turret's height), the mast's width, the tubes, the door and panel, the brakes.

Receipts, round 3 (on the final files; logs under `P/r3/receipts/` and `P/r3/receipts2/`): `loara.selftest.mjs` PASS at
both qualities, its proportion checks now round 3's (the guns 17.5 mm from the turret at worst, at -10 degrees: the
pods' inner lower edge over the skirt's flare where it starts; 52.9 mm from the hull at worst, yaw 180 at -10 degrees;
the envelope 6.949 x 3.720 x 5.471 m, inside 3 % of the spec's 6.88 x 3.65 x 5.47, the shells and the boxes the
difference); the contact probe 0 floating / 0 clipping; the roof-pocket census none (its first pass found the wedge
under each shell above the cheek's foot, 1,056 and 1,012 cm2; the shells were filled down into the fenders); the
gun-junction census CLOSED (2 mouths, 3 poses; 0 gun gaps; the bore line's 34 mm behind-pivot run behind the pods' rear
face is informational); `internalPlacement` on pza_loara alone (`P/scripts/placement_loara.mjs`): sides, rings,
volumes and overlaps empty; the digest of the nine PT-91/T-72B3-hull ids byte-identical to R0's with
`frontMudguards` added, pza_loara moved (22bb9fce77b7); typecheck clean (TypeScript 7, no unused symbols, oxlint).

## Construction work order

- Done (builder P): the measured build on the base vehicle's own hull and running-gear builders; the spec's turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew boxes read from the build's frame; the clearance
  probe in the fixture.
- Owed (coordinator): register `profiles/loara.selftest.mjs` in the suite (round 3 changed its proportion checks); the generated tables for this id (combat
  anatomy, `npm run tank:anatomy:update` and `check`; marking seats; interior fill; presentation anchors; auxiliary
  inventory; tank assets); the photographic packet registration; `pza_loara: []` in
  `nationalGunClearance.selftest.mjs`'s curves if the suite should hold it there too (the fixture already holds the
  hull at every 5 degrees of yaw); `spaaLoara`'s driver station frontLeft in `internalLayoutRegistry.ts` (his crew box,
  hatch and periscopes now sit 0.45 m left); a fleet pass for the T-72 road wheels' ribbed, holed face.
