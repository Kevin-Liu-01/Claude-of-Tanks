# Merkava Mk 4B (`merkava4b`) — reference packet (release 262 family rebuild)

**Exact variant.** The early Mk 4 without Trophy (Mk 4B, 2006: the base model's fixes, WP-HE-4): the stepped turret with
modules over its front, sides, rear and the whole roof; no loader's hatch on early tanks; the commander's cupola on the
right with its remotely fired MAG; one smoke launcher at each turret front corner; only the right exhaust grille; the
rearmost skirt section of bars (GS-4, WP-RU, AT-4, OTW). The Latrun Mk 4 photos cannot tell a 4 from a 4B.

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

## Measurements used by the build

| Station | Value | From |
|---|---|---|
| Deck | 1.60 m to z 1.96, the nose falling to 1.03 m | X-4 roof rays |
| Road wheels | r 0.395, z -2.24 -1.40 -0.30 0.62 1.48 2.36 (re-spaced: the study's 0.69 m wheels sat 0.795 m apart) | X-4, 790 mm |
| Sprocket / idler | z 3.30 / -3.04 | X-4 |
| Turret | ring 0.45 m aft of the hull centre; the long nose 2.50 m ahead of it; core to +-1.64 under 12 cm modules; roof 0.88-0.94 over the deck | BP-4, X-4 sections, Latrun photos |
| Gun | trunnion 2.20 m ahead of the ring at 1.99 m; muzzle at z 5.24 (9.04 m); evacuator 0.60 m centred 0.80 m ahead of the mantlet; five sleeve segments | published length, PHOTO |

## Gap table: the old pile vs the sources vs the 262 build

| Feature | Old pile (release 260) | Sources | 262 build |
|---|---|---|---|
| Gun length | muzzle at +4.34 ("the supplied Mk.4B oracle carries the compact MG253 gun run ... rather than extending to the published value"), barely clear of the hood | 9.04 m | 9.04 m, five segments, evacuator ahead of the mantlet |
| Gun hood | a fixed brick moved onto rig_gun by receipt | large pointed mantlet | the turret's long nose over a mantlet riding rig_gun |
| Turret packages | 10 cassettes a side | modules on sides and roof | side and cheek modules, the spec's two packages |
| Loader's hatch | none | none on early tanks | none |
| Depression | -2.7..-5.5 deg over the front | -7 deg (spec 8) | full spec depression over the front arc |

## Build route (release 262)

One family builder draws the six marks: `src/vehicles/profiles/merkava.ts` (the stepped builder and profile record) over
`merkavaFamilyMarks.ts` (this mark's measured record), `merkavaFamilyHull.ts` (hull loft, sponsons over the track's top
run, fenders, running gear, skirts, glacis and stern fittings), `merkavaFamilyTurret.ts` (the shell lofted from measured
stations, the bolted packages, roof equipment, basket and ball-and-chain) and `merkavaFamilyGun.ts` (the barrel as one
crisp-banded solid of revolution: tube, thermal sleeve and clamps, evacuator, muzzle; mantlet, collar and boot on
rig_gun). The 13.8k-line `merkava.ts` pile it replaces, its oracle-fit constants and its seven fit receipts are retired;
the old packet is in git history (`git show 24c5c5b039:docs/references/tanks/merkava4b.md`). Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`.

The registered comparison oracle (`public/models/tanks/community/recovered/*.glb`, tools/procedural-fidelity.html) is a
width-normalised community print with a short gun (the old packets measured its muzzle 0.4-0.9 m short of the published
length gun forward); the 262 build follows the published dimensions and the photos instead, so its print scores against
that oracle are expected to move and are reported, not chased.
