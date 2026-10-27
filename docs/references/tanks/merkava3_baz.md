# Merkava Mk 3 Baz (`merkava3_baz`) — reference packet (release 262 family rebuild)

**Exact variant.** The **Mk 3D Baz** ("3 Bet Baz Dor Dalet", from 1999): the Mk 3B Baz with fourth-generation (Kasag)
turret modules protruding sideways in a stepped wedge, giving much better all-round turret protection, and all-steel road
wheels (BTVT, WP-HE-M, KM). Schema-1 id `merkava3d` (tankIdAliases.ts); the spec row is named "Merkava Mk.3D". The
out-of-scope `merkava3d` (the Mk 3D X source study, merkavaX.ts) is a separate build and unchanged.

Status: implementation in progress on `item/merkava-family-262`; qualification and publication pending (see the lane
report). Facts compiled 2026-10-27 (sources below); every number in the build comes from this packet.

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

## Measurements used by the build

As the Mk 3C, with the side modules 20 cm deep standing 6 cm off the core's flat sides (turret half-width to +-1.71) and
the cheek wedges carried out to +-1.62.

## Gap table: the old pile vs the sources vs the 262 build

| Feature | Old pile (release 260) | Sources | 262 build |
|---|---|---|---|
| Gun length | muzzle at +4.55 (oracle nose +3.35) | 9.04 m | 9.04 m |
| Turret packages | 18 cells a side | Dor Dalet modules protruding sideways | protruding side modules + cheek wedges, the spec's two packages |
| Running gear | oracle course, owner-marked patches removed by receipt | 790 mm wheels, 5 rollers | measured X-3D stations |
| Depression | -2.2..-3.8 deg over the front | -7 deg (spec 8) | full spec depression over the front arc |

## Build route (release 262)

One family builder draws the six marks: `src/vehicles/profiles/merkava.ts` (the stepped builder and profile record) over
`merkavaFamilyMarks.ts` (this mark's measured record), `merkavaFamilyHull.ts` (hull loft, sponsons over the track's top
run, fenders, running gear, skirts, glacis and stern fittings), `merkavaFamilyTurret.ts` (the shell lofted from measured
stations, the bolted packages, roof equipment, basket and ball-and-chain) and `merkavaFamilyGun.ts` (the barrel as one
crisp-banded solid of revolution: tube, thermal sleeve and clamps, evacuator, muzzle; mantlet, collar and boot on
rig_gun). The 13.8k-line `merkava.ts` pile it replaces, its oracle-fit constants and its seven fit receipts are retired;
the old packet is in git history (`git show 24c5c5b039:docs/references/tanks/merkava3d.md`). Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`.

The registered comparison oracle (`public/models/tanks/community/recovered/*.glb`, tools/procedural-fidelity.html) is a
width-normalised community print with a short gun (the old packets measured its muzzle 0.4-0.9 m short of the published
length gun forward); the 262 build follows the published dimensions and the photos instead, so its print scores against
that oracle are expected to move and are reported, not chased.
