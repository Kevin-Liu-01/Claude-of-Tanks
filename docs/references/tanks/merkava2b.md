# Merkava Mk 2B (`merkava2b`) — reference packet (release 262 family rebuild)

**Exact variant.** Merkava Siman 2 Bet: the Mk 2 (1983-89) with its thermal fire control. The Mk 2 added composite
add-on screens bolted to the turret's sides and front, moved the 60 mm mortar inside (its tube at the left front of the
roof, ahead of the loader's hatch), hung the ball-and-chain round a large basket and added the hull rear baskets; about
ten skirt panels hung 50 mm further out (WP-RU, HOW, KM, WP-EN).

The supplied Mk.2B carries the add-on screens (14 turret `ex_armor` plates), an empty over-gun cradle, and a 0.10 m tube standing 0.5 m above the turret's right rear (x -1.04, z -2.45; also in the Latrun Mk 2 right-side photo), drawn as its own cylinder. The published note above puts the internal mortar's tube at the left front of the roof; what this right-rear tube is, is not settled here: the build draws it as measured.

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending. The family's run
packet (scope, comparison contract, owner decisions, evidence matrix, round log) is
[docs/history/research/merkava-family-262.md](../../history/research/merkava-family-262.md).

## Supplied source (the approved target, owner 2026-10-27)

| Item | Value |
|---|---|
| Archive | `~/Downloads/Claude of Tanks Models/merkava-mk2b.zip`, SHA-256 `90b8061b554c5d2fa83c2791d52fda5cf41ab9629cea7d8cb3bfaa57c7c798f9` |
| Member | `source/Merkava Mk_2B.zip` → `Merkava Mk.2B.obj` (Wavefront OBJ + MTL, game-extracted, flattened groups) |
| OBJ | SHA-256 `613e22ce492bf6ed59d6dd182841d7f108a279c7c4b6850df713276059efd248`, 22,511,710 bytes, 176 groups, 217,221 triangles |
| Bounds (m) | -1.987, -0.020, -4.033 .. 1.962, 5.197, 4.722 (antennas included) |
| Frame | identity: metres, +Y up, +Z the bow, +X the vehicle's left, ground y 0 |
| Canonical oracle | `public/models/community-candidates/merkava2b_supplied_x_source.glb` (ignored), SHA-256 `f15d59be87ffe27a1fa913371316d3a3ab7c0b2720ffeec8eec3a408a2979637`; `tools/source-world-registration.mjs` (fused) |
| Licence | none recorded in the archive; owner-supplied, reference-only, never redistributed or loaded |

## Sources

| Key | Source |
|---|---|
| WP-EN | Wikipedia, "Merkava": https://en.wikipedia.org/wiki/Merkava |
| WP-RU | Russian Wikipedia, "Меркава": https://ru.wikipedia.org/wiki/Меркава |
| WP-HE-M / -1..-4 | Hebrew Wikipedia, "מרכבה (טנק)" and the mark articles: https://he.wikipedia.org/wiki/מרכבה_(טנק) |
| BTVT | btvt.narod.ru, «Основной боевой танк Меркава»: http://btvt.narod.ru/4/morkova/merkava.htm |
| GS-1..4, GS-SPEC | GlobalSecurity Merkava pages: https://www.globalsecurity.org/military/world/israel/merkava-specs.htm |
| MT-1..4 | Military-Today (Wayback): https://web.archive.org/web/20220411174453/http://www.military-today.com/tanks/merkava_mk1.htm |
| AR-3 / AT-4 | Army Recognition (Mk 3), Army Technology (Mk 4): https://www.army-technology.com/projects/merkava4/ |
| HOW | History of War: https://historyofwar.org/articles/weapons_merkava.html |
| IMI / WP-IMI | IMI 120 mm L44 MG251/3 (Wayback 2016-12-31); https://en.wikipedia.org/wiki/IMI_120_mm_gun |
| WP-M68 | https://en.wikipedia.org/wiki/M68_tank_gun |
| LAT | Yad La-Shiryon (Latrun) placards, read from Commons photos |
| KM | Kitmaker "Merkava variants reference": https://forums.kitmaker.net/t/merkava-variants-reference/35527 |
| BP-1..4 | Wikimedia Commons 3-views (the-blueprints.com, CC BY-SA 4.0, uploaded by Dr Dan Saranga): File:Merkava Mk I blueprint.jpg, File:Idf merkava mk ii-63717.jpg, File:Merkava Mk III blueprint.jpg, File:Merkava Mk IV blueprint.jpg |
| X-3D / X-4 | The repo's measured Merkava 3D X and Mk 4 X source studies: docs/references/tanks/merkava3d_x.source-measurements.json, merkava4_x.source-measurements.json |

### Photographs (Wikimedia Commons; local copies in `~/cot-lanes/merkava-family-262/refs/merkava2b/`, not redistributed)

| Photo | Commons page | Author, licence | Shows | Identification |
|---|---|---|---|---|
| mk2_latrun_side_right.jpg | https://commons.wikimedia.org/wiki/File:Merkava-2-latrun-3.jpg | Bukvoed (User:Bukvoed, Wikimedia Commons), CC BY 2.5 | right side profile (gun right) | Merkava Mk 2 at Yad La-Shiryon, hull no. 827001 (medium for "Mk 2", low for "2B") |
| mk2_latrun_front34.jpg | https://commons.wikimedia.org/wiki/File:Merkava-2-latrun-2.jpg | Bukvoed (User:Bukvoed, Wikimedia Commons), CC BY 2.5 | front-left 3/4 | Merkava Mk 2 (Latrun, 827001) (medium (see prototype caveat)) |
| mk2_latrun_rear.jpg | https://commons.wikimedia.org/wiki/File:Merkava-2-latrun-4.jpg | Bukvoed (User:Bukvoed, Wikimedia Commons), CC BY 2.5 | rear | Merkava Mk 2 (Latrun, 827001) (medium) |
| mk2_golan_1987_firing.jpg | https://commons.wikimedia.org/wiki/File:Merkava_Mk_II_in_the_Golan_Heights,_1987.jpg | Israel Press and Photo Agency (I.P.P.A.) photographer, CC BY 4.0 | front-left 3/4, firing, Golan Heights 1987 (green paint) | Merkava Mk 2 in service, 1987 (Mk 2A/2B era) (high for Mk 2, unknown sub-variant) |

## Published facts

| Fact | Value | Source |
|---|---|---|
| Hull length | 7.45 m | WP-EN, GS-2 |
| Length gun forward | 8.63 m (spec record 8.78; sources 8.30-8.65) | MT-2, GS-2 |
| Width without skirts | 3.70 m | WP-EN |
| Height to turret roof | 2.65 m | WP-EN |
| Running gear | as Mk 1: 6 x 790 mm wheels, 5 (or 3) return rollers, 640 mm track | WP-RU, GS-2 |
| Turret | Mk 1 wedge with ears plus composite add-on screens on the sides and front | WP-RU, HOW, KM |
| Basket / chains | large bustle basket with ball-and-chain round its lower edge; hull rear baskets | WP-RU, GS-2, BTVT |
| Mortar | internal, tube at the left front of the roof ahead of the loader's hatch | WP-RU, BTVT, KM |
| Gun | 105 mm M64, three-section thermal sleeve, evacuator near the turret | GS-2, PHOTO |
| Machine guns | coax, commander's and loader's MAGs; MT-2 lists a 12.7 mm over the gun | GS-2, MT-2 |
| Smoke | 12 dischargers | WP-EN |
| Exhaust | single grille, right side | WP-HE-2 |

## Measured datums (source; hull frame: ground 0, hull centre 0, +Z the bow)

| Datum | Value | From |
|---|---|---|
| Hull (structural) | z -3.80 .. 3.77, half-width 1.938, deck 1.70 | `vehicle#root` and sponsons |
| Road wheels | six a side at z -2.515, -1.55, -0.575, 0.39, 1.21, 2.175; r 0.396, axles 0.452 | `wheel_l/r_01..06` |
| Sprocket / idler | z 3.04 y 0.86 r 0.372 / z -3.365 y 0.829 r 0.37 | `wheel_*_drive`, `wheel_*_back` |
| Return rollers | 5 a side | `wheel_*_top_*` |
| Track | centre +-1.532, width 0.637 | `track_l/r` |
| Turret | ring centre z -0.867 at the deck; 48 stations at 0.1 m (smoothed), crown 2.79, half-width to 1.44; gun slot from z 0.30, half-width 0.212 | `bone_turret` / `turret` |
| Gun (M64) | bore 2.082; barrel z 1.195 .. muzzle 4.725 (32 radial stations; muzzle r 0.077, evacuator r 0.140); gun mask z -0.17 .. 1.23 | `gun_barrel`, `bone_gun` |
| Trunnion | y 2.082, z 1.180 (constructed: the OBJ has no pivots; in the gun mask at the nose slot, uncertainty about +-0.2 m along the bore) | construction |
| Over the gun | cradle only (x +-0.21, y 2.39-2.50, z 0.51-0.77) | `mg_twin` / `bone_gun` |
| Detail parts | 740 pieces (turret armour 90, hull armour 191): each connected source piece over 6 cm, a box or two-station loft | `ex_armor*`, `ex_decor*`, `hatch*`, `ex_lantern*`, sights |

## Gap table: the old pile (release 260) vs the supplied source vs the 262 build

| Feature | Old pile (release 260) | Supplied source | 262 build (rev 3) |
|---|---|---|---|
| Gun | muzzle 0.94 m past an oracle nose at +3.49; trunnion-to-muzzle 4.58 m | muzzle z 4.725, round tube 32 stations, evacuator r 0.140 | the measured round profile as one solid of revolution, steps chamfered, muzzle at z 4.725; the gun mask riding in the slot; only the barrel recoils |
| Over the gun | none | cradle only (x +-0.21, y 2.39-2.50, z 0.51-0.77) | the empty cradle at its measured bounds |
| Turret shell | oracle-fit casting | 48 stations, crown 2.79 | lofted through the smoothed stations, the gun slot open where the source has it; roof kit kept off the shell |
| Turret armour | 10 cheek cells a side | 90 `ex_armor` pieces | each piece at its measured attitude, the spec's two removable packages over the permanent shell |
| Running gear | deep scalloped oracle skirts over an oracle course | stations above | the same stations and radii; fleet track thickness (FSP-04) |
| Depression | -1.7..-4 deg over the front | (the source carries no limits) | measured by `tools/gun-depression-sweep.mjs` on the rebuilt geometry (family packet) |

## Build route (release 262)

`src/vehicles/profiles/merkava.ts` (the stepped builder) over `merkavaFamilyMarks.ts` (this mark's record, built from
`merkavaFamilySource.ts`, the lane fit's measurements of the supplied model), `merkavaFamilyHull.ts`,
`merkavaFamilyTurret.ts`, `merkavaFamilyGun.ts` and `merkavaFamilyDetails.ts`. Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`. The pre-262 packet is in
git history (`git show b93941ce9d:docs/references/tanks/merkava2b.md`).
