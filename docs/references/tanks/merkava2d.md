# Merkava Mk 2D (`merkava2d`) — reference packet (release 262 family rebuild)

**Exact variant.** Merkava Siman 2 Bet Dor Dalet (from 1999, WP-RU): Mk 2B tanks retrofitted with fourth-generation
bolt-on armour on hull and turret: boxes on the turret's sides and front, plates on the sponson sides above the skirts
and on the left of the glacis, belly armour (BTVT, WP-HE-2).

The supplied Mk.2D carries the Dor Dalet boxes (30 turret `ex_armor` plates; the turret mesh itself includes the side modules, half-width to 1.56 m) and the 12.7 mm M2 with its side ammunition box over the gun (`bone_mg_twin`).

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending. The family's run
packet (scope, comparison contract, owner decisions, evidence matrix, round log) is
[docs/history/research/merkava-family-262.md](../../history/research/merkava-family-262.md).

## Supplied source (the approved target, owner 2026-10-27)

| Item | Value |
|---|---|
| Archive | `~/Downloads/Claude of Tanks Models/merkava-mk2d.zip`, SHA-256 `c16e94a6823c98cda64fc27e08bd9aac07aea1afad5cd79565f3c2b54393cadb` |
| Member | `source/Merkava Mk_2D.zip` → `Merkava Mk.2D.obj` (Wavefront OBJ + MTL, game-extracted, flattened groups) |
| OBJ | SHA-256 `5686170353cee2f34bbe88406e17e39048040e1088060ab777857ed22a46a010`, 27,924,880 bytes, 219 groups, 259,381 triangles |
| Bounds (m) | -1.992, -0.020, -4.033 .. 1.992, 5.197, 4.723 (antennas included) |
| Frame | identity: metres, +Y up, +Z the bow, +X the vehicle's left, ground y 0 |
| Canonical oracle | `public/models/community-candidates/merkava2d_supplied_x_source.glb` (ignored), SHA-256 `c76f1d522eb81314004c714c6fe98bcae19a06dd83f5ebaf5f3a54d76260c725`; `tools/source-world-registration.mjs` (fused) |
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

### Photographs (Wikimedia Commons; local copies in `~/cot-lanes/merkava-family-262/refs/merkava2d/`, not redistributed)

| Photo | Commons page | Author, licence | Shows | Identification |
|---|---|---|---|---|
| mk2d_gaza_2012_front34.jpg | https://commons.wikimedia.org/wiki/File:Flickr_-_Israel_Defense_Forces_-_IDF_Forces_in_Staging_Areas_Around_Gaza_Strip_(1).jpg | Israel Defense Forces (Flickr account 45644610@N03), IDF Spokesperson's Unit, CC BY-SA 3.0 | front-left 3/4, staging area near Gaza Nov 2012, with mine plough | Merkava Mk 2D (Dor Dalet add-on armour) (medium-high) |
| mk2d_7bde_2009_side_left.jpg | https://commons.wikimedia.org/wiki/File:Flickr_-_Israel_Defense_Forces_-_Pushing_Through.jpg | Israel Defense Forces, CC BY-SA 2.0 | left side, wading, 7th Brigade (77th Bn) exercise March 2009 | Merkava Mk 2 series, probably Mk 2D (medium-low) |
| mk2d_7bde_2009_front34.jpg | https://commons.wikimedia.org/wiki/File:Flickr_-_Israel_Defense_Forces_-_7th_Brigade_Batallion_Exercise,_March_2009.jpg | Israel Defense Forces, CC BY 2.0 | front-right 3/4, coloured smoke, 7th Brigade exercise March 2009 | Merkava Mk 2 series, probably Mk 2D (medium-low) |

## Published facts

| Fact | Value | Source |
|---|---|---|
| Hull, running gear, gun | as Mk 2B | WP-RU, GS-2, WP-EN |
| Turret | Dor Dalet bolt-on boxes on the sides and front (and roof) | BTVT, WP-HE-2, PHOTO (Gaza 2012) |
| Hull | appliqué on the sponson sides above the skirts; left glacis plate; belly armour | BTVT, WP-HE-2 |
| Basket / chains | as Mk 2 | PHOTO (2009) |

## Measured datums (source; hull frame: ground 0, hull centre 0, +Z the bow)

| Datum | Value | From |
|---|---|---|
| Hull (structural) | z -3.80 .. 3.77, half-width 1.938, deck 1.70 | `vehicle#root` and sponsons |
| Road wheels | six a side at z -2.515, -1.55, -0.575, 0.39, 1.21, 2.175; r 0.396, axles 0.452 | `wheel_l/r_01..06` |
| Sprocket / idler | z 3.04 y 0.86 r 0.372 / z -3.365 y 0.829 r 0.37 | `wheel_*_drive`, `wheel_*_back` |
| Return rollers | 5 a side | `wheel_*_top_*` |
| Track | centre +-1.532, width 0.637 | `track_l/r` |
| Turret | ring centre z -1.049 at the deck; 48 stations at 0.1 m (smoothed), crown 2.78, half-width to 1.75; gun slot from z 0.40, half-width 0.227 | `bone_turret` / `turret` |
| Gun (M64) | bore 2.082; barrel z 1.035 .. muzzle 4.725 (24 radial stations; muzzle r 0.076, evacuator r 0.139); gun mask z -0.17 .. 1.62 | `gun_barrel`, `bone_gun` |
| Trunnion | y 2.082, z 1.180 (constructed: the OBJ has no pivots; in the gun mask at the nose slot, uncertainty about +-0.2 m along the bore) | construction |
| Over the gun | `bone_mg_twin` M2: z 0.45-2.11, bore 2.70, box on its left | `mg_twin` / `bone_gun` |
| Detail parts | 996 pieces (turret armour 154, hull armour 498): each connected source piece over 6 cm, a box or two-station loft | `ex_armor*`, `ex_decor*`, `hatch*`, `ex_lantern*`, sights |

## Gap table: the old pile (release 260) vs the supplied source vs the 262 build

| Feature | Old pile (release 260) | Supplied source | 262 build (rev 3) |
|---|---|---|---|
| Gun | muzzle 0.57 m past an oracle nose at +3.49; trunnion-to-muzzle 4.21 m (the stubbiest of the six) | muzzle z 4.725, round tube 24 stations, evacuator r 0.139 | the measured round profile as one solid of revolution, steps chamfered, muzzle at z 4.725; the gun mask riding in the slot; only the barrel recoils |
| Over the gun | none | `bone_mg_twin` M2: z 0.45-2.11, bore 2.70, box on its left | 12.7 mm M2 scaled to the source's back plate and muzzle, its bore at the measured height, on its cradle, the side ammunition box |
| Turret shell | oracle-fit casting | 48 stations, crown 2.78 | lofted through the smoothed stations, the gun slot open where the source has it; roof kit kept off the shell |
| Turret armour | 15 cells a side on wedge modules | 154 `ex_armor` pieces | each piece at its measured attitude, the spec's two removable packages over the permanent shell |
| Running gear | oracle course | stations above | the same stations and radii; fleet track thickness (FSP-04) |
| Depression | blocked above +7.6 deg at yaw 7-11 and above +12.3 deg at yaw 147-153 | (the source carries no limits) | measured by `tools/gun-depression-sweep.mjs` on the rebuilt geometry (family packet) |

## Build route (release 262)

`src/vehicles/profiles/merkava.ts` (the stepped builder) over `merkavaFamilyMarks.ts` (this mark's record, built from
`merkavaFamilySource.ts`, the lane fit's measurements of the supplied model), `merkavaFamilyHull.ts`,
`merkavaFamilyTurret.ts`, `merkavaFamilyGun.ts` and `merkavaFamilyDetails.ts`. Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`. The pre-262 packet is in
git history (`git show b93941ce9d:docs/references/tanks/merkava2d.md`).
