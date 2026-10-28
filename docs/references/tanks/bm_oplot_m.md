# T-84BM Oplot-M (`bm_oplot_m`) and T-84BM Oplot-T (`bm_oplot_t`) — packet

First-party procedural builds of KMDB's BM Oplot-M (Object 478DU9-1) and its Thai export, the BM Oplot-T
(Object 478DU9-T), release 262. One builder, `buildOplotBM(P, 'm' | 't')` in `src/vehicles/profiles/oplotBM.ts`; shared
datums and ERA sectors in `src/vehicles/oplotFlankLayout.ts` (the OPLOT_BM_* block); spec rows in `src/vehicles/ukraine.ts`. The Thai deltas are
in [bm_oplot_t.md](bm_oplot_t.md).

## Current status

- Updated: 2026-10-27.
- Owner request, verbatim (2026-10-27): "or current t84 and oplot m in ukranian need to be updated. make the existing
  ones sinto lower tier tanks with new names / prototype names and make a new tier x t84bm oplot m and t84bm oplot t
  (images attachd and look for moere ferefneces too)". Tier table approved by the owner the same day ("OK approved",
  via Main), with period 2000 ammunition for the renamed T-84U.
- IDs and names: `bm_oplot_m` "T-84BM Oplot-M" (short "Oplot-M"), `bm_oplot_t` "T-84BM Oplot-T" (short "Oplot-T").
  The canonical slug `t84bm_oplot_m` belongs to the renamed T-84U Oplot (ids never re-keyed, no tankIdSchema bump); the
  new ids are the slugs of KMDB's product names, BM Oplot-M / BM Oplot-T, and collide with nothing.
- The older pair (ids kept): `t84` is now "Object 478DU2" (the 1992-95 T-84 prototype), `t84bm_oplot_m` is "T-84U
  Oplot" (Object 478DU9, the 2000 serial tank) on 3BM42 Mango / 3BK29 / 3OF26. See [t84.md](t84.md) and
  [ua_t84_oplot_m.md](ua_t84_oplot_m.md).
- Tiers (shown and matchmaking, src/techTree/tiers.ts): Object 478DU2 VI, T-84U Oplot VI, Oplot-M X, Oplot-T X.
- Branch: `item/oplot-262` from origin/main 7d045a7588.

## Run packet (docs/tank-generation/templates/run-packet.md)

- Mode: independent source-backed X build (`bm_oplot_m`) plus an explicit first-party derivative (`bm_oplot_t`,
  variant deltas in [bm_oplot_t.md](bm_oplot_t.md)); historical preservation of `t84` / `t84bm_oplot_m` (geometry
  untouched, names and tiers only; the T-84U's ammunition per Main's ruling).
- Owned files: `src/vehicles/profiles/oplotBM.ts`, `src/vehicles/oplotFlankLayout.ts` (the OPLOT_BM_* block), the Oplot rows of
  `src/vehicles/ukraine.ts`, `tools/oplot-bm-x-reference-overrides.ts` and its selftest, `src/vehicles/oplotBMGun.selftest.mjs`,
  this packet; registry rows for the two ids. Integrator: Main (release 262).
- Raw source: `~/cot-lanes/oplot-ref/ukrainian_t-84bm_oplot-m.glb`, SHA-256
  `761c8698003c6729f5fe6ed719eafa437be95b13694734375084977ae75a3d8f`, 5,318,120 B, binary glTF, 13 meshes / 18,992
  triangles, named nodes (HULL, HULL ARMOR, HULL POKLOP, SKIRT, KOLLO, GUS, TUR, TUR ARMOR, TUR POKLOP, `default076`
  turret interior, three loose MG meshes); no animation, skins, duplicate vehicle or LOD. Owner-supplied comparison drop,
  CC BY-NC 4.0 (docs/ATTRIBUTION.md); reference-only.
- Registration (frozen before optimization): `node tools/source-x-oracle.mjs --prepare=<raw> --recipe=.qa-dev/oplot262/bm_oplot_m_x.recipe.json`
  with axes `[-x, y, -z]` (bow to +Z, determinant +1), uniform scale **4.10**, translation `[-0.0226, -0.1476, 0.8098]`
  (track span centred, ground y 0, hull z span centred: source datums only). The scale is the one uniform value that
  keeps the published hull (7.075 m), width over the tracks (3.40 m) and turret roof (2.215-2.285 m) each within 3%.
  Canonical oracle `public/models/community-candidates/bm_oplot_m_x_source.glb` (ignored), SHA-256
  `d2adad43bba88a867f743aeeacf969587e7be0c2bbcaeee0259218f3145ab22a`, bounds 4.30 x 3.86 x 10.02 m, nothing omitted.
  Certificate `tools/source-world-registration.mjs` `bm_oplot_m` (fused: the 125 mm gun is part of TUR, so no honest
  moving gun owner; whole-vehicle comparison at rest), override `qualityBar: 'exemplar'` (92 per view and component).
- Published-figure conflicts (recorded, not resolved by distortion): the print's skirts flare to 4.30 m overall width
  (published 3.775 m); its hull at 4.10 is 6.92 m (-2.2%); with the gun 10.02 m (published 9.72, +3.1%); road wheels
  0.343 m radius (670 mm published, +2.5%).
- Construction frame: authored at 4.0 times the print (turret about its ring), baked once to 4.10 by
  `resizeAuthoredVehicle(P, OPLOT_BM_SCALE = 1.025)`; the spec, the combat rig and the certificate share that frame.

### Evidence matrix (current revision; see the round log)

| Gate | Status | Command / artifact | Result |
| --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | source-x-oracle --inspect/--prepare; `tools/oplot-bm-x-reference.selftest.mjs` | hashes pinned, no omissions; ring and trunnion on the certificate datums (r8) |
| Registered silhouettes (92 every view) | PASS r12 | `procedural-fidelity.mjs --ids=bm_oplot_m --check --board --neutral-board` | r12, the owner's kit set aside (`tools/owner-kit-targets.mjs`, digests authenticated against `bm_oplot_m-owner-kit-receipt.json`): 94.8 overall; front 93.3, front-left 95.4, left 94.4, rear-left 94.1, rear 93.0, rear-right 94.9, right 92.8, front-right 93.9, top 95.1. Raw full vehicle with the kit (sidecar, informational): 93.2, lowest view 91.3. r8 was 92.1 with five views under 92 |
| Geometry gate (92 every component, 3% dims) | PASS r12 | `geometry-gate.mjs --ids=bm_oplot_m --check` | r12, the kit set aside: min 92.8 (whole curves 92.8, dims 94.6, floaters 100); packet `docs/geometry-gate/bm_oplot_m.json` with its raw full-vehicle sidecar (informational). Hull length is compared with the oracle's own P95 body extent, 6.825 m (`silhouetteHullLengthM`; the stepped stern's thin overhang falls under the band rule; measured the same on two runs), the build reads 6.939 (+1.7%). r8 was whole 89.3, dims 0 |
| Independent critic | PASS (2 rounds) | blind subagents on z-buffered renders vs the owner's references | round 1: FAIL distinctness -> kits reworked; round 2: both recognisable, distinctness PASS; the defects they named fixed or answered (roof "hole" and fender "pits" were a painter's-sort artefact of the lane renderer) |
| Turret parenting / track clip | turret-parent explained; track clip PASS | turret-parent-audit; `track-clip-audit --exact --strict` | turret-parent: one "stranded" hullHatch per id = the driver's hatch under the cheek ERA overhang, 6 cm clear. Track clip: front 0 / rear 0, strict sweep 0/0, shoes 0 on all three family ids after the bow fender ledges were lifted clear of the band over the idler (the first strict run read 150 front / 206 sweep voxels: the ledge underside 12 cm inside the band) |
| Gun clearance over -5..+14 | PASS | gun-depression-sweep r9 -> `gunPitchByYawDeg`; `oplotBMGun.selftest.mjs` | worst 2.7 cm (Oplot-T over its APU), full -5 to 142 / 134 deg of yaw |
| Anatomy, fills, markings, seats, spare, ledger, gun lines | PASS | lane chain (ids-scoped), r12 | anatomy fixpoint PASS, rigs gate PASS, ids-only diffs |
| Assets / hero cards / drawings / centering | PASS | genIcons; genDrawings; genHeroCards + hero-cards-compose ship; presentation-centering --check | icons and drawings on the stepped stern and the moved PNK-6 (three ids); hero cards from one fresh layers run, hero-cards:check ok (223 cards); centering PASS, all four ids (worst residual 0.15 px) |
| Composed release (lane) | scoring PASS for bm_oplot_m; A N/A-as-FAIL for the derivatives | `tank:release:check -- --ids=bm_oplot_m,bm_oplot_t,t84bm_oplot_m --gate --lane` | bm_oplot_m: gate 92.8, track clip 0/0+0/0, contiguity 0, decor mg2, sealed, fidelity 94.7. bm_oplot_t and t84bm_oplot_m: every physical stage PASS (track clip, contiguity, decor, sealed); their A stage reads FAIL under --gate because they are declared derivatives of this certified base with no registration of their own (no Oplot-T or T-84U 3D source here). The run stops after scoring, so the fleet-probe stage ran by hand (TESTS-OWED, Oplot 262) |

## Sources

- Oracle (private, never shipped): "Ukrainian T-84BM Oplot-M" by 42manako (Sketchfab), CC-BY-NC-4.0, SHA-256 prefix
  `761c8698003c6729`, `~/cot-lanes/oplot-ref/ukrainian_t-84bm_oplot-m.glb` (gitignored lane folder). Nodes: HULL,
  HULL ARMOR (bow ERA), HULL POKLOP (driver's hatch), SKIRT, KOLLO (wheels), GUS (tracks), TUR, TUR ARMOR, TUR POKLOP,
  `default076` (turret interior), mg. Front is source -Z. No vertex, index, texture or topology of it ships.
- Owner references: `~/cot-launch-state/streams/owner-shots/20261027-oplot-m-ref.png` (green Oplot-M) and
  `20261027-oplot-t-ref.png` (desert Oplot-T).
- Published figures: KMDB/Malyshev and Ukroboronprom via Army Technology ("Oplot-M Main Battle Tank"), Quwa ("KMDB-
  Malyshev Oplot"), Wikipedia "T-84" (variants list: 478DU2, 478DU4, 478DU9, 478DU9-1, 478DU9-T, Oplot-P, 478DU10;
  Oplot-T order of 49 in 2011, deliveries to 2018), GlobalSecurity "T-84 fire control" (PNK-5/TKN-5 on the T-84U),
  War Thunder's BM Oplot-T development note (modified side screens, rear ladder, extra power unit, 30 km/h reverse).
  - Combat weight 51 t; crew 3; 6TD-2E 1,200 hp (882 kW); 70 km/h road; 500 km with extra tanks.
  - Length 9.72 m with the gun forward; hull 7.075 m; width 3.40 m over the tracks (3.78 m with skirts).
  - 46 main-gun rounds, 28 in the carousel; KT-7.62 coax (1,250 rounds); KT-12.7 (450), laid from the PNK-6.
  - Six dual rubber-tyred road wheels and five return rollers a side, rear drive; 580 mm track.
  - Duplet built-in ERA on turret and hull, ERA on the driver's compartment sides, large hinged rubber skirts.
  - Varta: laser warning, IR jammers, aerosol screens. The Kombat laser-guided missile, fired through the gun, 5 km,
    tandem warhead.

## Registration and conflicts

- Source frame to build frame: rotate 180 degrees about +Y (front to +Z); ground at source y 0.036.
- The print is short against the published hull. Its stations are read at 4.194 lengthwise (hull 1.687 units = 7.075 m)
  and at 4.0 for heights and widths: at 4.0 the road wheels (r 0.34), track outer edge (1.72), turret roof (2.17),
  gun axis (1.77) and belly (0.44) meet the published figures, at 4.194 they all read 5 % high. The turret uses 4.0 in
  all three axes about the ring (source z 0.19 at 4.194).
- Conflicts recorded, published figures kept: the print's skirts flare to +-2.1 m at 4.0 (published 3.78 m overall
  width; the build hangs them at +-1.89); its gun reaches 9.92 m overall (published 9.72); its road-wheel stations are
  unevenly pitched (kept as measured: z 2.52, 1.66, 0.73, -0.07, -1.03, -1.89).

## Measured sections (build frame, metres; tools: lane `slices.py` / `loops.py` cuts of the oracle at the scales above)

Round 3 (owner 2026-10-27: "match the geometry a lot better, fix and smooth this out a lot better") replaced the
round-1/2 boxes with lofts through these sections.

| Part | Section data |
| --- | --- |
| Hull body | half-width 1.10, belly 0.42 (z -2.95..2.86), deck 1.46 (z -3.20..2.14); glacis 2.14 -> nose 3.48 at 0.86; lower plate 2.86 -> 3.54 at 0.72 |
| Fender ledges | x 1.08..1.80, y 1.20..1.46 from z -3.05 to 2.30, falling to 0.91..1.22 at z 3.46 |
| Skirt boxes | inner 1.80, outer face 1.86 at the deck to 2.08 at y 0.95; top 1.46 to z 1.80 then down to 1.27 at 3.30; nose rolls to (0.86..0.98, 1.98) at z 3.78; rear end z -3.06 |
| Rubber skirt | x 2.05..2.07, from 0.975 down to 0.22 (z -1.55..2.60), raked to 0.78 at z -2.96 and 0.51 at 3.24 |
| Turret body (ring frame, z local = hull z - 0.19) | half-width 0.86 / 1.00 / 1.23 / 1.47 / 1.23 / 1.08 at z -1.28 / -0.69 / -0.09 / 0.51 / 0.81 / 0.97; roof 0.69 falling to 0.58 at the nose; bevelled top edges |
| Cheek Duplet stacks | columns |x| 0.41-0.72, 0.735-1.00, 1.015-1.20, 1.215-1.40, 1.415-1.58 (+ flank 1.595-1.72), two courses y 0.09-0.30 / 0.31-0.52, fronts on z = 1.82 - 0.847 (|x| - 1.0) |
| Flank ERA / smoke housings | ERA from the body side to |x| 1.72 over z -0.39..0.40 (local); housings |x| 0.86-1.64 over z -1.04..-0.39, y 0.13-0.58 |
| Bustle | box x -0.75..+0.40, z -1.98..-1.26, y 0.10/0.15..0.68; right bin x -1.43..-0.83, z -2.24..-0.99; left rail basket x 0.42..1.34 |
| Gun | trunnion (0, 0.295, 1.30); shield +-0.26 x -0.21..+0.17 from gun z -0.33 to 0.27; fume extractor gun z 2.50..3.30 (hull z 4.0..4.8) |

## Construction

Authored at 4.0 times the print, baked once to the registered 4.10 (`OPLOT_BM_SCALE` 1.025); sections as tabled above.

- Hull: loftHull on the measured deck/belly lines, fender ledges, the 6TD-2's radiator grilles and stern step grille,
  driver's hatch, glacis Duplet (three courses of four a side, each seated by glacisEraCassette), the stowed dozer
  blade on its arms (measured: edge 0.275 m above the ground), headlamp clusters, stern grille, recovery eyes and the
  unditching log on its brackets.
- Skirts: the flared armoured box (inner 1.80, face 1.86 at the deck to 2.08 at 0.95, rolled noses to z 3.78) with its
  Duplet lids, and hinged rubber panels below it (`hullEquipment`: painted, outside the structural hull).
- Running gear: six rubber-tyred wheels r 0.335, five rollers, rear sprocket, front idler, 580 mm track.
- Turret: the measured body loft and bevels; the cheek Duplet columns as orientedSlab stacks with rising undersides,
  two courses; flank Duplet; smoke housings with four tube mouths each; the bustle with its raised rear underside and
  the right bin; cast gun shield; domed commander's cupola; PNK-6 tower (twin-window head); gunner's sight; IR lamp;
  Varta heads on the cheek corners; laser-warning heads at the rear; lifting eyes; two whips.
- KBA-3: ruSaddle and ruBoot, stepped thermal sleeve, fume extractor, muzzle collar and true bore; coax port right of
  the gun.

### The two specialist kits (owner 2026-10-27: "a lot more visually distinct and specialized with extra side armor,
fuel barrels in back, lights, 2 gun towers instead of 1")

| | Oplot-M (`buildOplotMKit`) | Oplot-T (`buildOplotTKit`) |
| --- | --- | --- |
| Stations (sourceMachineGun, working) | KT-12.7 open cradle at the right rear with its outboard sight-and-ammunition box (the print's; clear -248..4 deg); KT-7.62 enclosed mini-turret at the left rear (-83..229) | M2 enclosed mini-turret on a raised armoured tower with a large searchlight (-248..4); 7.62 open cradle (-70..245) |
| Extra side armour | a lower Duplet course on each rubber skirt, seven gapped blocks a side (skirt sector) | two courses of 9 cm bolted blocks on the six rear skirt panels (addExternalArmor); a stand-off horizontal-slat cage round the turret's rear half |
| Lights | LED bars on the cheek stacks, a work lamp astern | a searchlight on the left cheek, work lamps fore and aft |
| Stern | twin 200 L drums (issue paint 1) strapped to the lower rear plate under the grille and the log | the same cradle, desert-issue drums (paint 3) |
| Hull fittings | none beyond the shared hull | the APU's low box out on the left rear fender edge (side exhaust), a stirrup step off that fender's end |
| Stock coat | Ukrainian Plain Olive (`paint_bm_oplot_m`) | Ukrainian Three-Tone Desert (`paint_bm_oplot_t`) |

Station arcs and depression tables come from `tools/roof-station-arcs.mjs` on the build (2 degrees, 0.01 rad margin).
The drums and the APU are sized so the main gun still clears them: the measured curve is in the spec
(`gunPitchByYawDeg`) and `oplotBMGun.selftest.mjs` holds it.

## Combat data (src/vehicles/ukraine.ts)

- modernArmor frame at the real dims: glacis 500 mm physical (KE 560 / CE 650), cheeks 650 (620 / 700), turret sides
  300 (340 / 400), mantlet 350 (400 / 450), bustle ammunition.
- Duplet sectors (one seed plate each; the anatomy replaces them with the cassette lids): turret L/R, flanks L/R and
  glacis at keReduction 0.26 / CE 480, skirts L/R at 0.14 / 340, all anti-tandem (sim/damage.ts).
- Gun: +14 / -5 (T-80UD lineage), reload 6.3 s, BTA-4 APFSDS (840 / 780 / 710 mm), 3BK29M HEAT (700), 3OF26 HE-Frag,
  Kombat ATGM fired through the gun (guided, launcherTubes 0, 800 mm tandem, 6 rounds, 8 s): 46 rounds in all.
- Mobility: 1,200 hp, 51.0 t (Oplot-T 51.5 t), 70 / 30 km/h, turret 44 deg/s.
- Internal layout `sovietMz` (carousel); markings anchor on the turret's right flank; the Oplot-T paints the Thai flag.
