# Merkava Mk 3C (`merkava3c`) — reference packet (release 262 family rebuild)

**Exact variant.** War Thunder's "Merkava Mk.3C" is the Israeli **Mk 3B Baz** (1995/96): the Mk 3B's improved turret
modules with the Baz (Barak Zohar) fire control, its fez-shaped independent commander's sight, the taller gunner's sight
and the round loader's hatch; flat bolted turret modules, rubber-tyred road wheels, no protruding Dor Dalet cheeks. No
Israeli source uses "3C" (FACTS: WP-HE-M, WP-RU, BTVT; [WT] naming only).

The supplied Mk.3C carries flat bolted modules (13 turret `ex_armor` plates) and the 12.7 mm M2 with its side ammunition box over the gun (`bone_mg_twin`), which the earlier 262 rebuild had read as "none".

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending. The family's run
packet (scope, comparison contract, owner decisions, evidence matrix, round log) is
[docs/history/research/merkava-family-262.md](../../history/research/merkava-family-262.md).

## Supplied source (the approved target, owner 2026-10-27)

| Item | Value |
|---|---|
| Archive | `~/Downloads/Claude of Tanks Models/merkava-mk3c.zip`, SHA-256 `c270fc743ee9a30d4b65db494253c8c9c2b77a52d9a30a830e40c9466d75156f` |
| Member | `source/Merkava Mk_3C.zip` → `Merkava Mk.3C.obj` (Wavefront OBJ + MTL, game-extracted, flattened groups) |
| OBJ | SHA-256 `5c82063dbd8161f1be9240c16619273ca3bdfef3ad49fc00d3faafcbbf68dcb7`, 23,260,465 bytes, 178 groups, 225,939 triangles |
| Bounds (m) | -1.988, -0.020, -4.208 .. 1.988, 5.168, 4.630 (antennas included) |
| Frame | identity: metres, +Y up, +Z the bow, +X the vehicle's left, ground y 0 |
| Canonical oracle | `public/models/community-candidates/merkava3c_supplied_x_source.glb` (ignored), SHA-256 `7d55fb050e1d27b8c6a383484a443a5557052f122910a8fb650fe908b53c87aa`; `tools/source-world-registration.mjs` (fused) |
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

### Photographs (Wikimedia Commons; local copies in `~/cot-lanes/merkava-family-262/refs/merkava3c/`, not redistributed)

| Photo | Commons page | Author, licence | Shows | Identification |
|---|---|---|---|---|
| mk3_latrun_side_right.jpg | https://commons.wikimedia.org/wiki/File:Merkava-3-latrun-3.jpg | Bukvoed (User:Bukvoed, Wikimedia Commons), CC BY 2.5 | right side profile (gun right) | Merkava Mk 3 at Yad La-Shiryon: PROTOTYPE with original flat-sided Mk 3 turret modules (high that it is the museum Mk 3 prototype; it represents the pre-Dor Dalet Mk 3 shape, not specifically 3B/3B Baz) |
| mk3_latrun_front34.jpg | https://commons.wikimedia.org/wiki/File:Merkava-3-latrun-2.jpg | Bukvoed (User:Bukvoed, Wikimedia Commons), CC BY 2.5 | front-left 3/4 | Merkava Mk 3 prototype (Latrun) (high (prototype)) |
| mk3_latrun_2017_gun_front.jpg | https://commons.wikimedia.org/wiki/File:Latrun_220917_Merkava_III_02.jpg | Oren Rozen, CC BY-SA 4.0 | head-on gun/turret front close-up | Merkava Mk 3 (Latrun prototype, photographed 2017) (high) |
| mk3_2002_defensive_shield_front34.jpg | https://commons.wikimedia.org/wiki/File:Operation_Defensive_Shield_96.jpg | IDF Spokesperson's Unit photographer, CC BY-SA 3.0 | front-left 3/4 close, street, Operation Defensive Shield (2002) | Merkava Mk 3, pre-Dor Dalet turret (Mk 3B / 3B Baz era) (medium) |

## Published facts

| Fact | Value | Source |
|---|---|---|
| Hull length | 7.60 m (one source 7.97) | WP-EN, GS-3 |
| Length gun forward | 9.04 m | WP-EN, GS-3 |
| Width without skirts | 3.70-3.72 m | WP-EN, GS-3 |
| Height to turret roof | 2.66 m | WP-EN |
| Running gear | 6 x 790 mm wheels on trailing arms (all rearward), rotary dampers, 5 return rollers, 660 mm track | GS-3, WP-RU |
| Turret | 230 mm longer than Mk 2; bolted steel box modules, flat near-vertical sides; no ears | GS-3, AR-3, KM, WP-HE-3 |
| Rear | armoured fuel tanks in the stern plate, aluminium-faced baskets either side of the door (+~500 mm) | GS-3, WP-RU, BTVT |
| Gun | MG251 120 mm L/44, 5.30 m barrel, thermal sleeve, evacuator ~0.6 m long centred ~0.95 m ahead of the turret; +20/-7 deg | IMI, GS-3, PHOTO |
| Machine guns | coax, commander's and loader's MAGs; 12.7 mm over the gun only on the LIC kit | MT-3, AR-3 |
| Smoke | CL-3030, 12, a 2 x 3 cluster each side | HOW, WP-EN, PHOTO (2002) |

## Measured datums (source; hull frame: ground 0, hull centre 0, +Z the bow)

| Datum | Value | From |
|---|---|---|
| Hull (structural) | z -3.75 .. 3.76, half-width 1.938, deck 1.70 | `vehicle#root` and sponsons |
| Road wheels | six a side at z -2.55, -1.666, -0.537, 0.322, 1.18, 2.033; r 0.371, axles 0.433 | `wheel_l/r_01..06` |
| Sprocket / idler | z 3.04 y 0.854 r 0.372 / z -3.365 y 0.823 r 0.37 | `wheel_*_drive`, `wheel_*_back` |
| Return rollers | 5 a side | `wheel_*_top_*` |
| Track | centre +-1.532, width 0.637 | `track_l/r` |
| Turret | ring centre z -0.928 at the deck; 48 stations at 0.1 m (smoothed), crown 2.70, half-width to 1.46; gun slot from z 0.70, half-width 0.235 | `bone_turret` / `turret` |
| Gun (MG25x) | bore 2.076; barrel z 1.255 .. muzzle 4.635 (60 radial stations; muzzle r 0.084, evacuator r 0.172); gun mask z -0.17 .. 1.73 | `gun_barrel`, `bone_gun` |
| Trunnion | y 2.076, z 1.050 (constructed: the OBJ has no pivots; in the gun mask at the nose slot, uncertainty about +-0.2 m along the bore) | construction |
| Over the gun | `bone_mg_twin` M2: z 0.45-2.11, bore 2.70, box on its left | `mg_twin` / `bone_gun` |
| Detail parts | 669 pieces (turret armour 87, hull armour 333): each connected source piece over 6 cm, a box or two-station loft | `ex_armor*`, `ex_decor*`, `hatch*`, `ex_lantern*`, sights |

## Gap table: the old pile (release 260) vs the supplied source vs the 262 build

| Feature | Old pile (release 260) | Supplied source | 262 build (rev 3) |
|---|---|---|---|
| Gun | muzzle at +4.58 through an oracle casting, 5.36 m trunnion-to-muzzle | muzzle z 4.635, round tube 60 stations, evacuator r 0.172 | the measured round profile as one solid of revolution, steps chamfered, muzzle at z 4.635; the gun mask riding in the slot; only the barrel recoils |
| Over the gun | none | `bone_mg_twin` M2: z 0.45-2.11, bore 2.70, box on its left | 12.7 mm M2 scaled to the source's back plate and muzzle, its bore at the measured height, on its cradle, the side ammunition box |
| Turret shell | oracle-fit casting | 48 stations, crown 2.70 | lofted through the smoothed stations, the gun slot open where the source has it; roof kit kept off the shell |
| Turret armour | 18 cells a side on an outer carrier ring | 87 `ex_armor` pieces | each piece at its measured attitude, the spec's two removable packages over the permanent shell |
| Running gear | oracle course | stations above | the same stations and radii; fleet track thickness (FSP-04) |
| Depression | -1.7..-3.4 deg over the front | (the source carries no limits) | measured by `tools/gun-depression-sweep.mjs` on the rebuilt geometry (family packet) |

## Build route (release 262)

`src/vehicles/profiles/merkava.ts` (the stepped builder) over `merkavaFamilyMarks.ts` (this mark's record, built from
`merkavaFamilySource.ts`, the lane fit's measurements of the supplied model), `merkavaFamilyHull.ts`,
`merkavaFamilyTurret.ts`, `merkavaFamilyGun.ts` and `merkavaFamilyDetails.ts`. Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`. The pre-262 packet is in
git history (`git show b93941ce9d:docs/references/tanks/merkava3c.md`).
