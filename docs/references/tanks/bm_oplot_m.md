# T-84BM Oplot-M (`bm_oplot_m`) and T-84BM Oplot-T (`bm_oplot_t`) — packet

First-party procedural builds of KMDB's BM Oplot-M (Object 478DU9-1) and its Thai export, the BM Oplot-T
(Object 478DU9-T), release 262. One builder, `buildOplotBM(P, 'm' | 't')` in `src/vehicles/profiles/oplotBM.ts`; shared
datums and ERA sectors in `src/vehicles/oplotBMLayout.ts`; spec rows in `src/vehicles/ukraine.ts`. The Thai deltas are
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

- Hull: T-80UD-lineage loft (deck 1.455, 68 degree upper glacis from z 2.42 to the nose at 0.96, lower plate to the
  0.44 belly), fender shelves to +-1.80, stowage bins, the 6TD-2's radiator grilles, its left-side exhaust box, driver's
  hatch with three periscopes, the self-entrenching blade on the lower plate, headlamp clusters, stern grille, recovery
  eyes and the unditching log.
- Glacis Duplet: two courses of four modules a side, each seated by a downward ray (glacisEraCassette).
- Skirts: a canted armoured band from the fender edge (1.79 to 1.875) with Duplet modules (eight a side on the
  Oplot-M), hinged rubber panels to 0.30 raked up at both ends, a bow flap over the idler.
- Running gear: shared rubber-tyred set, six wheels r 0.335 at y 0.43, five rollers r 0.085, sprocket r 0.30 at z -2.63,
  idler r 0.26 at z 3.29, 580 mm track, band top 1.07.
- Turret (ring at hull (0, 1.47, 0.19)): welded shell lofted at z -1.32..1.22 (half-width to 1.58, walls leaning in),
  the armoured ammunition bustle to z -2.26 with blow-off roof panels, two Duplet cheek blocks either side of the gun slot
  (front face to |x| 1.10, a 45 degree chamfer to the flank at 1.64), cassette lids on the faces and chamfers, two
  courses of flank Duplet, the cast gun shield, the PNK-6 tower with its twin-window head ahead of the commander's
  cupola, the gunner's sight box and IR illuminator, Varta jammer heads on the cheek corners and laser-warning heads at
  the rear corners, six-tube aerosol banks, the right-side stowage bin, the left rear rail basket and two whips.
- KT-12.7 remote mount (addFieldRoofWeapon) at the right rear of the roof; the commander's PNK-6 lays it.
- KBA-3: trunnion at turret (0, 0.295, 1.30), stepped thermal sleeve with clamp bands, fume extractor at 2.30-2.86,
  muzzle collar, true bore; muzzle at hull z 6.18 (9.72 m overall). Coax port right of the gun.

## Combat data (src/vehicles/ukraine.ts)

- modernArmor frame at the real dims: glacis 500 mm physical (KE 560 / CE 650), cheeks 650 (620 / 700), turret sides
  300 (340 / 400), mantlet 350 (400 / 450), bustle ammunition.
- Duplet sectors (one seed plate each; the anatomy replaces them with the cassette lids): turret L/R, flanks L/R and
  glacis at keReduction 0.26 / CE 480, skirts L/R at 0.14 / 340, all anti-tandem (sim/damage.ts).
- Gun: +14 / -5 (T-80UD lineage), reload 6.3 s, BTA-4 APFSDS (840 / 780 / 710 mm), 3BK29M HEAT (700), 3OF26 HE-Frag,
  Kombat ATGM fired through the gun (guided, launcherTubes 0, 800 mm tandem, 6 rounds, 8 s): 46 rounds in all.
- Mobility: 1,200 hp, 51.0 t (Oplot-T 51.5 t), 70 / 30 km/h, turret 44 deg/s.
- Internal layout `sovietMz` (carousel); markings anchor on the turret's right flank; the Oplot-T paints the Thai flag.
