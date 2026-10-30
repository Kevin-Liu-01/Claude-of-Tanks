# Merkava Mk 1B (`merkava1b`) — reference packet (release 262 family rebuild)

**Exact variant.** Merkava Siman 1 Bet: the 1982-83 refit of production Mk 1s toward Mk 2 level (BTVT, WP-RU,
WP-HE-1): the ball-and-chain curtain on a small turret basket, replaced side skirts, smoke dischargers, the exhaust
reduced to one grille on the right. **No added turret armour**; the 60 mm mortar stays **external**, on the right by the
commander's hatch; no hull rear baskets.

The supplied Mk.1B carries seven turret `ex_armor` plates (bound as the spec's two removable packages, superseding the earlier "no turret armour" reading of the 1B) and its 12.7 mm M2 inside the gun bone.

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending. The family's run
packet (scope, comparison contract, owner decisions, evidence matrix, round log) is
[docs/history/research/merkava-family-262.md](../../history/research/merkava-family-262.md).

## Supplied source (the approved target, owner 2026-10-27)

| Item | Value |
|---|---|
| Archive | `~/Downloads/Claude of Tanks Models/merkava-mk1b.zip`, SHA-256 `685a52c520f536b8b00ad9a73cb5acaab06baee3e50ff5e3918ca0b206a7aacd` |
| Member | `source/Merkava Mk_1B.zip` → `Merkava Mk.1B.obj` (Wavefront OBJ + MTL, game-extracted, flattened groups) |
| OBJ | SHA-256 `bf1199f383ce03dc5b2b9cc438d62b1732adcdbb3ac894ca568a871831a362c1`, 22,696,809 bytes, 158 groups, 221,809 triangles |
| Bounds (m) | -1.993, -0.020, -4.033 .. 1.993, 5.198, 4.722 (antennas included) |
| Frame | identity: metres, +Y up, +Z the bow, +X the vehicle's left, ground y 0 |
| Canonical oracle | `public/models/community-candidates/merkava1b_supplied_x_source.glb` (ignored), SHA-256 `bcf4f84b9685fe25bbacbab3cd89a6d8ed5086fc37fa24267ef9e821e9b8c3aa`; `tools/source-world-registration.mjs` (fused) |
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

### Photographs (Wikimedia Commons; local copies in `~/cot-lanes/merkava-family-262/refs/merkava1b/`, not redistributed)

| Photo | Commons page | Author, licence | Shows | Identification |
|---|---|---|---|---|
| mk1_lesany_side_left_2011.jpg | https://commons.wikimedia.org/wiki/File:Tank_Merkava_Mk1_.jpg | Tom733, CC BY-SA 3.0 | left side, slight front 3/4, tank moving (Tank Day 2011) | Merkava Mk 1, late/refit configuration = Mk 1 Bet (1B) (medium-high) |
| mk1_saumur_820024_front34.jpg | https://commons.wikimedia.org/wiki/File:Merkava_Mk1_%E2%80%98820024%E2%80%99_at_Mus%C3%A9e_des_Blind%C3%A9s,_Saumur,_France_(53353694965).jpg | Alan Wilson from Peterborough, Cambs, UK, CC BY-SA 2.0 | front-left 3/4, indoor museum | Merkava Mk 1 (hull no. 820024), late configuration consistent with Mk 1B (medium) |
| mk1_saumur_rear34_chains.jpg | https://commons.wikimedia.org/wiki/File:Merkava_Mk_1_in_the_Mus%C3%A9e_des_Blind%C3%A9s,_France,_pic-2.JPG | Alf van Beem, CC0 | rear-right 3/4: turret basket, ball-and-chain curtain, rear hull | Merkava Mk 1 at Saumur, late (1B-style) configuration (medium) |
| mk1b_lesany_front_gun.jpg | https://commons.wikimedia.org/wiki/File:Merkava_mkib_lesany.jpg | Adamicz, CC BY-SA 3.0 | frontal (slightly left), running, gun and mantlet area | Merkava Mk 1B (uploader caption "Merkava Mk.IB") (medium-high) |

## Published facts

| Fact | Value | Source |
|---|---|---|
| Hull length | 7.45 m | WP-EN, MT-1, GS-1, WP-RU |
| Length gun forward | 8.63 m (conflict: 8.30 WP-EN/WP-RU, 8.65 GS-1) | MT-1 |
| Width without skirts | 3.70 m | WP-EN, MT-1, BTVT |
| Height to turret roof | 2.65 m (2.64-2.75) | WP-EN, GS-1, BTVT |
| Ground clearance | 0.47-0.53 m | HOW; WP-EN, WP-RU |
| Road wheels | 6 a side, 790 mm, coil springs on alternating arms (read as 3 pairs) | WP-RU, GS-SPEC |
| Return rollers | 5 a side (conflict: 4 HOW, 3 GS-2), behind the skirts | WP-RU |
| Track | 640 mm, ground length 4.52 m | WP-RU, GS-2 |
| Turret | narrow cast-and-welded wedge, small frontal area, long bustle, rounded "ears" at the base | WP-RU, WP-HE-3, photos |
| Gun | 105 mm M64 L71A (licensed M68): tube 5.347 m, 5.55 m overall; three-section thermal sleeve; eccentric evacuator ~0.55 m long centred ~0.65 m ahead of the turret face; no separate mantlet; +20/-8.5 deg | WP-M68, GS-2, WP-RU, PHOTO |
| Machine guns | coax MAG left of the gun; commander's and loader's MAGs; a 12.7 mm M2 on the gun mask on many tanks | IW-1, BTVT, BP-1 |
| Smoke | 12 dischargers, a six-tube cluster on each cheek | WP-EN, WP-HE-1, PHOTO |
| Rear door | two-leaf clamshell, 600 mm wide | WP-RU, WP-EN |
| Skirts | six sections to about hub height (the refit's replacement skirts) | WP-RU, BTVT, PHOTO (Lešany) |

## Measured datums (source; hull frame: ground 0, hull centre 0, +Z the bow)

| Datum | Value | From |
|---|---|---|
| Hull (structural) | z -3.80 .. 3.77, half-width 1.891, deck 1.70 | `vehicle#root` and sponsons |
| Road wheels | six a side at z -2.515, -1.55, -0.575, 0.39, 1.21, 2.175; r 0.396, axles 0.452 | `wheel_l/r_01..06` |
| Sprocket / idler | z 3.04 y 0.86 r 0.372 / z -3.365 y 0.829 r 0.37 | `wheel_*_drive`, `wheel_*_back` |
| Return rollers | 5 a side | `wheel_*_top_*` |
| Track | centre +-1.532, width 0.637 | `track_l/r` |
| Turret | ring centre z -0.872 at the deck; 48 stations at 0.1 m (smoothed), crown 2.78, half-width to 1.44; gun slot from z 0.30, half-width 0.208 | `bone_turret` / `turret` |
| Gun (M64) | bore 2.082; barrel z 1.195 .. muzzle 4.725 (34 radial stations; muzzle r 0.077, evacuator r 0.140); gun mask z -0.17 .. 1.23 | `gun_barrel`, `bone_gun` |
| Trunnion | y 2.082, z 1.180 (constructed: the OBJ has no pivots; in the gun mask at the nose slot, uncertainty about +-0.2 m along the bore) | construction |
| Over the gun | M2 in the gun bone: z 0.45-2.11, bore 2.705 | `mg_twin` / `bone_gun` |
| Detail parts | 740 pieces (turret armour 66, hull armour 408): each connected source piece over 6 cm, a box or two-station loft | `ex_armor*`, `ex_decor*`, `hatch*`, `ex_lantern*`, sights |

## Gap table: the old pile (release 260) vs the supplied source vs the 262 build

| Feature | Old pile (release 260) | Supplied source | 262 build (rev 3) |
|---|---|---|---|
| Gun | muzzle 1.30 m past an oracle nose at +3.05; trunnion-to-muzzle 5.11 m against a mantlet buried in an oracle-fit casting | muzzle z 4.725, round tube 34 stations, evacuator r 0.140 | the measured round profile as one solid of revolution, steps chamfered, muzzle at z 4.725; the gun mask riding in the slot; only the barrel recoils |
| Over the gun | an over-gun M2 placed by oracle rays | M2 in the gun bone: z 0.45-2.11, bore 2.705 | 12.7 mm M2 scaled to the source's back plate and muzzle, its bore at the measured height, on its cradle, the side ammunition box |
| Turret shell | oracle-fit rising-roof casting with fit receipts | 48 stations, crown 2.78 | lofted through the smoothed stations, the gun slot open where the source has it; roof kit kept off the shell |
| Turret armour | eight invented cells on each cheek | 66 `ex_armor` pieces | each piece at its measured attitude, the spec's two removable packages over the permanent shell |
| Running gear | wheels r 0.355, five rollers, oracle course | stations above | the same stations and radii; fleet track thickness (FSP-04) |
| Depression | -0.7..-2.4 deg over the glacis | (the source carries no limits) | measured by `tools/gun-depression-sweep.mjs` on the rebuilt geometry (family packet) |

## Build route (release 262)

`src/vehicles/profiles/merkava.ts` (the stepped builder) over `merkavaFamilyMarks.ts` (this mark's record, built from
`merkavaFamilySource.ts`, the lane fit's measurements of the supplied model), `merkavaFamilyHull.ts`,
`merkavaFamilyTurret.ts`, `merkavaFamilyGun.ts` and `merkavaFamilyDetails.ts`. Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`. The pre-262 packet is in
git history (`git show b93941ce9d:docs/references/tanks/merkava1b.md`).
