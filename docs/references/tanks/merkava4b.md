# Merkava Mk 4B (`merkava4b`) — reference packet (release 262 family rebuild)

**Exact variant.** The early Mk 4 without Trophy (Mk 4B, 2006: the base model's fixes, WP-HE-4): the stepped turret with
modules over its front, sides, rear and the whole roof; no loader's hatch on early tanks; the commander's cupola on the
right with its remotely fired MAG; one smoke launcher at each turret front corner; only the right exhaust grille; the
rearmost skirt section of bars (GS-4, WP-RU, AT-4, OTW). The Latrun Mk 4 photos cannot tell a 4 from a 4B.

The supplied Mk.4B carries 18 turret `ex_armor` plates, the 12.7 mm M2 high on the pointed gun housing (`mg_twin`, bore 2.81 m) and one roof MAG station; no right-side louvre shows above its side plates.

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending. The family's run
packet (scope, comparison contract, owner decisions, evidence matrix, round log) is
[docs/history/research/merkava-family-262.md](../../history/research/merkava-family-262.md).

## Supplied source (the approved target, owner 2026-10-27)

| Item | Value |
|---|---|
| Archive | `~/Downloads/Claude of Tanks Models/merkava-mk4b.zip`, SHA-256 `5081b6e802a09e7d02396f7b6814b35e1710caec093386bb5a3f4d5fe90d4f88` |
| Member | `source/Merkava Mk_4B.zip` → `Merkava Mk.4B.obj` (Wavefront OBJ + MTL, game-extracted, flattened groups) |
| OBJ | SHA-256 `66f04acfa274dc672eb8c9a0e4fba1ec0dfce273d88c82f9b5d75649dcf6b7c2`, 28,003,572 bytes, 196 groups, 275,372 triangles |
| Bounds (m) | -1.999, -0.032, -4.167 .. 1.999, 4.828, 5.053 (antennas included) |
| Frame | identity: metres, +Y up, +Z the bow, +X the vehicle's left, ground y 0 |
| Canonical oracle | `public/models/community-candidates/merkava4b_supplied_x_source.glb` (ignored), SHA-256 `b3d01d76b9bec5e7e5ca28effb6824e15170b6dd72bb6c8f61e0eda195f6fd3e`; `tools/source-world-registration.mjs` (fused) |
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

### Photographs (Wikimedia Commons; local copies in `~/cot-lanes/merkava-family-262/refs/merkava4b/`, not redistributed)

| Photo | Commons page | Author, licence | Shows | Identification |
|---|---|---|---|---|
| mk4_latrun_front34.jpg | https://commons.wikimedia.org/wiki/File:Merkava4-pic001.jpg | MathKnight, CC BY-SA 3.0 | front-left 3/4 | Merkava Mk 4 (early production, no Trophy APS) at Yad La-Shiryon (high for Mk 4 without Trophy; Mk 4 vs "4B" (2006 fixes) not determinable) |
| mk4_latrun_side_right.jpg | https://commons.wikimedia.org/wiki/File:Merkava4-pic007.jpg | MathKnight, CC BY-SA 3.0 | right side profile (gun right) | Merkava Mk 4 (Latrun, no Trophy) (high) |
| mk4_latrun_gun_top.jpg | https://commons.wikimedia.org/wiki/File:Merkava4-pic002.jpg | MathKnight, CC BY-SA 3.0 | overhead view down the MG253 gun: mantlet, evacuator, sleeve segments | Merkava Mk 4 (Latrun) (high) |
| mk4_latrun_side34_right.jpg | https://commons.wikimedia.org/wiki/File:MerkavaMk4_ZE001m.jpg | MathKnight and Zachi Evenor, CC BY 3.0 | front-right 3/4 | Merkava Mk 4 (no Trophy), Latrun 2011 (high) |

## Published facts

| Fact | Value | Source |
|---|---|---|
| Hull length | 7.60 m (one source 7.80) | WP-EN, AT-4 |
| Length gun forward | 9.04 m | WP-EN |
| Width | 3.72 m without skirts, 3.92 m with | WP-EN, AT-4 |
| Height to turret roof | 2.66 m | WP-EN |
| Running gear | 6 x 790 mm wheels, 660 mm track; return rollers not published (5 assumed, behind the skirts) | WP-RU |
| Gun | MG253 120 mm L/44 (WP-EN: MG251-LR), 5.30 m, VIDCO sleeve in five segments, large pointed mantlet, evacuator ~0.8 m ahead of the mantlet; +20/-7 deg | WP-IMI, IMI, PHOTO |
| Machine guns | coax; commander's MAG (right); a remote 12.7 mm M2 over the gun on some | GS-4, MT-4, WP-RU |

## Measured datums (source; hull frame: ground 0, hull centre 0, +Z the bow)

| Datum | Value | From |
|---|---|---|
| Hull (structural) | z -3.83 .. 4.11, half-width 1.978, deck 1.70 | `vehicle#root` and sponsons |
| Road wheels | six a side at z -2.313, -1.452, -0.273, 0.726, 1.657, 2.53; r 0.393, axles 0.443 | `wheel_l/r_01..06` |
| Sprocket / idler | z 3.485 y 0.917 r 0.372 / z -3.105 y 0.864 r 0.37 | `wheel_*_drive`, `wheel_*_back` |
| Return rollers | 5 a side | `wheel_*_top_*` |
| Track | centre +-1.515, width 0.578 | `track_l/r` |
| Turret | ring centre z -1.254 at the deck; 45 stations at 0.1 m (smoothed), crown 3.10, half-width to 1.75; gun slot none (the pointed gun housing) | `bone_turret` / `turret` |
| Gun (MG25x) | bore 2.159; barrel z 1.515 .. muzzle 5.055 (60 radial stations; muzzle r 0.084, evacuator r 0.172); gun mask z -0.17 .. 2.12 | `gun_barrel`, `bone_gun` |
| Trunnion | y 2.159, z 0.650 (constructed: the OBJ has no pivots; in the gun mask at the nose slot, uncertainty about +-0.2 m along the bore) | construction |
| Over the gun | `mg_twin` M2: z 1.15-2.81, bore 2.81 | `mg_twin` / `bone_gun` |
| Detail parts | 1062 pieces (turret armour 261, hull armour 428): each connected source piece over 6 cm, a box or two-station loft | `ex_armor*`, `ex_decor*`, `hatch*`, `ex_lantern*`, sights |

## Gap table: the old pile (release 260) vs the supplied source vs the 262 build

| Feature | Old pile (release 260) | Supplied source | 262 build (rev 3) |
|---|---|---|---|
| Gun | muzzle at +4.34, barely clear of the hood | muzzle z 5.055, round tube 60 stations, evacuator r 0.172 | the measured round profile as one solid of revolution, steps chamfered, muzzle at z 5.055; the gun mask riding in the slot; only the barrel recoils |
| Over the gun | none | `mg_twin` M2: z 1.15-2.81, bore 2.81 | 12.7 mm M2 scaled to the source's back plate and muzzle, its bore at the measured height, on its cradle |
| Turret shell | a fixed brick hood moved onto rig_gun by receipt | 45 stations, crown 3.10 | lofted through the smoothed stations, the gun slot open where the source has it; roof kit kept off the shell |
| Turret armour | 10 cassettes a side | 261 `ex_armor` pieces | each piece at its measured attitude, the spec's two removable packages over the permanent shell |
| Running gear | oracle course | stations above | the same stations and radii; fleet track thickness (FSP-04) |
| Depression | -2.7..-5.5 deg over the front | (the source carries no limits) | measured by `tools/gun-depression-sweep.mjs` on the rebuilt geometry (family packet) |

## Build route (release 262)

`src/vehicles/profiles/merkava.ts` (the stepped builder) over `merkavaFamilyMarks.ts` (this mark's record, built from
`merkavaFamilySource.ts`, the lane fit's measurements of the supplied model), `merkavaFamilyHull.ts`,
`merkavaFamilyTurret.ts`, `merkavaFamilyGun.ts` and `merkavaFamilyDetails.ts`. Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`. The pre-262 packet is in
git history (`git show b93941ce9d:docs/references/tanks/merkava4b.md`).
