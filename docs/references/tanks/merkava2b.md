# Merkava Mk 2B (`merkava2b`) — reference packet (release 262 family rebuild)

**Exact variant.** Merkava Siman 2 Bet: the Mk 2 (1983-89) with its thermal fire control. The Mk 2 added composite
add-on screens bolted to the turret's sides and front, moved the 60 mm mortar inside (its tube at the left front of the
roof, ahead of the loader's hatch), hung the ball-and-chain round a large basket and added the hull rear baskets; about
ten skirt panels hung 50 mm further out (WP-RU, HOW, KM, WP-EN).

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

## Measurements used by the build

As the Mk 1B (shared hull, gear and turret core), plus: the skirts' ten panels at +-1.91..1.96 m to 0.56-0.58 m; the add-on
screens 5 cm proud of the cheeks (z -0.45..1.30 and 1.32..2.30 in the turret frame, 0.18-0.62 m over the deck); the
large basket to z -2.25 (turret frame) with the chains under its rear; the hull's rear mesh baskets either side of the
600 mm door; the internal mortar's roof port.

## Gap table: the old pile vs the sources vs the 262 build

| Feature | Old pile (release 260) | Sources | 262 build |
|---|---|---|---|
| Gun length | muzzle 0.94 m past an oracle nose at +3.49; trunnion-to-muzzle 4.58 m | 8.63-8.78 m gun forward | 8.63 m, the Mk 1B's gun and turret position |
| Turret packages | 10 cheek "ERA" cells a side | composite add-on screens bolted on | flat screens standing 5 cm off the cheeks, the spec's two packages |
| Rear | basket only | large basket + hull rear baskets | both |
| Skirts | deep scalloped oracle skirts | ~10 panels, 50 mm further out | 10 bolted panels at +-1.96 m |
| Depression | -1.7..-4 deg over the front | -8.5 deg | full spec depression over the front arc |

## Build route (release 262)

One family builder draws the six marks: `src/vehicles/profiles/merkava.ts` (the stepped builder and profile record) over
`merkavaFamilyMarks.ts` (this mark's measured record), `merkavaFamilyHull.ts` (hull loft, sponsons over the track's top
run, fenders, running gear, skirts, glacis and stern fittings), `merkavaFamilyTurret.ts` (the shell lofted from measured
stations, the bolted packages, roof equipment, basket and ball-and-chain) and `merkavaFamilyGun.ts` (the barrel as one
crisp-banded solid of revolution: tube, thermal sleeve and clamps, evacuator, muzzle; mantlet, collar and boot on
rig_gun). The 13.8k-line `merkava.ts` pile it replaces, its oracle-fit constants and its seven fit receipts are retired;
the old packet is in git history (`git show 24c5c5b039:docs/references/tanks/merkava2b.md`). Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`.

The registered comparison oracle (`public/models/tanks/community/recovered/*.glb`, tools/procedural-fidelity.html) is a
width-normalised community print with a short gun (the old packets measured its muzzle 0.4-0.9 m short of the published
length gun forward); the 262 build follows the published dimensions and the photos instead, so its print scores against
that oracle are expected to move and are reported, not chased.
