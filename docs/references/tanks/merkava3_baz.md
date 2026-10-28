# Merkava Mk 3 Baz (`merkava3_baz`) — reference packet (release 262 family rebuild)

**Exact variant.** The **Mk 3D Baz** ("3 Bet Baz Dor Dalet", from 1999): the Mk 3B Baz with fourth-generation (Kasag)
turret modules protruding sideways in a stepped wedge, giving much better all-round turret protection, and all-steel road
wheels (BTVT, WP-HE-M, KM). Schema-1 id `merkava3d` (tankIdAliases.ts); the spec row is named "Merkava Mk.3D". The
out-of-scope `merkava3d` (the Mk 3D X source study, merkavaX.ts) is a separate build and unchanged.

The supplied Mk.3D (registered for `merkava3_baz`) carries 9 turret `ex_armor` plates, the 12.7 mm M2 with its side ammunition box over the gun, and two thin mast bases standing clear of the roof (x -1.25 z -2.44; x 1.09 z -2.95).

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending. The family's run
packet (scope, comparison contract, owner decisions, evidence matrix, round log) is
[docs/history/research/merkava-family-262.md](../../history/research/merkava-family-262.md).

## Supplied source (the approved target, owner 2026-10-27)

| Item | Value |
|---|---|
| Archive | `~/Downloads/Claude of Tanks Models/merkava-mk3d.zip`, SHA-256 `2e19b525ccd108cb9b3cdc73cc152188992532cb0ac95b43fbd3b06062dcdbd3` |
| Member | `source/Merkava_Mk_3D.zip` → `Merkava_Mk.3D.obj` (Wavefront OBJ + MTL, game-extracted, flattened groups) |
| OBJ | SHA-256 `10c6cca6ebe07a2482664e554cdb4a0533d2166f402c3e9c141b6d81cfdcb8b7`, 24,907,649 bytes, 161 groups, 237,457 triangles |
| Bounds (m) | -1.988, -0.020, -4.208 .. 1.988, 5.138, 4.630 (antennas included) |
| Frame | identity: metres, +Y up, +Z the bow, +X the vehicle's left, ground y 0 |
| Canonical oracle | `public/models/community-candidates/merkava3_baz_supplied_x_source.glb` (ignored), SHA-256 `3f9ea08e23342137b519c767710750dcb4cb95ce7a9cf721323be6babd900760`; `tools/source-world-registration.mjs` (fused) |
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

### Photographs (Wikimedia Commons; local copies in `~/cot-lanes/merkava-family-262/refs/merkava3_baz/`, not redistributed)

| Photo | Commons page | Author, licence | Shows | Identification |
|---|---|---|---|---|
| mk3d_baz_2019_front34.jpg | https://commons.wikimedia.org/wiki/File:Merkeva_Mk_3D_-_Israeli_Tanks_2019-04-21_IZE-36.jpg | Dr. Zachi Evenor, CC BY 2.0 | front-left 3/4, 2019 | Merkava Mk 3D Baz (Mk 3 Bet Baz Dor Dalet) (high) |
| mk3d_baz_188bde_side_right.jpg | https://commons.wikimedia.org/wiki/File:Merkava3dKasag002.jpg | Lior34, CC BY-SA 3.0 | right side profile, 188th Brigade exercise | Merkava Mk 3D Baz (Kasag modules) (high) |
| mk3d_baz_kasag_front34.jpg | https://commons.wikimedia.org/wiki/File:Merkava3dKasag001.jpg | Michael Mass, Yad la-Shiryon Museum מיכאל מס, CC BY-SA 3.0 | front-left 3/4, elevated | Merkava Mk 3D Baz Kasag (high) |
| mk3d_baz_2013_side34_left.jpg | https://commons.wikimedia.org/wiki/File:Merkava_Mk_III_tank_01.jpg | Staselnik, CC BY-SA 3.0 | left side, shallow front 3/4, moving, 188th Brigade 2013 | Merkava Mk 3D Baz (high) |

## Published facts

| Fact | Value | Source |
|---|---|---|
| Hull, gear, gun | as Mk 3C | GS-3, WP-EN |
| Turret | Dor Dalet modules protruding sideways; a step along the module | BTVT, KM, PHOTO |
| Road wheels | all-steel (the fleet's Israel MBT wheel face is the owner's standard, nationWheelSets.ts) | BTVT |
| Weight | 65 t | WP-EN, AR-3 |
| Smoke / basket | clusters on the turret sides; ball-and-chain basket | WP-EN, PHOTO |

## Measured datums (source; hull frame: ground 0, hull centre 0, +Z the bow)

| Datum | Value | From |
|---|---|---|
| Hull (structural) | z -3.75 .. 3.76, half-width 1.938, deck 1.70 | `vehicle#root` and sponsons |
| Road wheels | six a side at z -2.55, -1.666, -0.537, 0.322, 1.18, 2.033; r 0.371, axles 0.433 | `wheel_l/r_01..06` |
| Sprocket / idler | z 3.04 y 0.854 r 0.372 / z -3.365 y 0.823 r 0.37 | `wheel_*_drive`, `wheel_*_back` |
| Return rollers | 5 a side | `wheel_*_top_*` |
| Track | centre +-1.532, width 0.637 | `track_l/r` |
| Turret | ring centre z -0.948 at the deck; 48 stations at 0.1 m (smoothed), crown 2.70, half-width to 1.89; gun slot from z 0.70, half-width 0.236 | `bone_turret` / `turret` |
| Gun (MG25x) | bore 2.076; barrel z 1.255 .. muzzle 4.635 (62 radial stations; muzzle r 0.084, evacuator r 0.172); gun mask z -0.17 .. 1.73 | `gun_barrel`, `bone_gun` |
| Trunnion | y 2.076, z 1.050 (constructed: the OBJ has no pivots; in the gun mask at the nose slot, uncertainty about +-0.2 m along the bore) | construction |
| Over the gun | `bone_mg_twin` M2: z 0.45-2.11, bore 2.70, box on its left | `mg_twin` / `bone_gun` |
| Detail parts | 651 pieces (turret armour 84, hull armour 237): each connected source piece over 6 cm, a box or two-station loft | `ex_armor*`, `ex_decor*`, `hatch*`, `ex_lantern*`, sights |

## Gap table: the old pile (release 260) vs the supplied source vs the 262 build

| Feature | Old pile (release 260) | Supplied source | 262 build (rev 3) |
|---|---|---|---|
| Gun | muzzle at +4.55 (oracle nose +3.35) | muzzle z 4.635, round tube 62 stations, evacuator r 0.172 | the measured round profile as one solid of revolution, steps chamfered, muzzle at z 4.635; the gun mask riding in the slot; only the barrel recoils |
| Over the gun | none | `bone_mg_twin` M2: z 0.45-2.11, bore 2.70, box on its left | 12.7 mm M2 scaled to the source's back plate and muzzle, its bore at the measured height, on its cradle, the side ammunition box |
| Turret shell | oracle-fit casting | 48 stations, crown 2.70 | lofted through the smoothed stations, the gun slot open where the source has it; roof kit kept off the shell |
| Turret armour | 18 cells a side | 84 `ex_armor` pieces | each piece at its measured attitude, the spec's two removable packages over the permanent shell |
| Running gear | oracle course, owner-marked patches removed by receipt | stations above | the same stations and radii; fleet track thickness (FSP-04) |
| Depression | -2.2..-3.8 deg over the front | (the source carries no limits) | measured by `tools/gun-depression-sweep.mjs` on the rebuilt geometry (family packet) |

## Build route (release 262)

`src/vehicles/profiles/merkava.ts` (the stepped builder) over `merkavaFamilyMarks.ts` (this mark's record, built from
`merkavaFamilySource.ts`, the lane fit's measurements of the supplied model), `merkavaFamilyHull.ts`,
`merkavaFamilyTurret.ts`, `merkavaFamilyGun.ts` and `merkavaFamilyDetails.ts`. Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`. The pre-262 packet is in
git history (`git show b93941ce9d:docs/references/tanks/merkava3_baz.md`).
