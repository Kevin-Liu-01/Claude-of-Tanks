# Merkava Mk 2D (`merkava2d`) — reference packet (release 262 family rebuild)

**Exact variant.** Merkava Siman 2 Bet Dor Dalet (from 1999, WP-RU): Mk 2B tanks retrofitted with fourth-generation
bolt-on armour on hull and turret: boxes on the turret's sides and front, plates on the sponson sides above the skirts
and on the left of the glacis, belly armour (BTVT, WP-HE-2).

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

## Measurements used by the build

As the Mk 2B, with the turret's Dor Dalet boxes 16-18 cm deep standing 6-8 cm off the cheeks (z -0.60..2.40 in the
turret frame) and 5 cm appliqué on the sponson sides above the skirts from z -1.6 to 2.2.

## Gap table: the old pile vs the sources vs the 262 build

| Feature | Old pile (release 260) | Sources | 262 build |
|---|---|---|---|
| Gun length | muzzle 0.57 m past an oracle nose at +3.49; trunnion-to-muzzle 4.21 m (the stubbiest of the six) | as Mk 2 | 8.63 m |
| Turret packages | 15 cells a side on wedge modules | Dor Dalet boxes | boxed modules on both cheeks, the spec's two packages |
| Hull | oracle hull | sponson appliqué | 5 cm appliqué over the skirts |
| Depression | blocked above +7.6 deg at yaw 7-11 and above +12.3 deg at yaw 147-153 | -8.5 deg | full spec depression over the front arc, no blocked window |

## Build route (release 262)

One family builder draws the six marks: `src/vehicles/profiles/merkava.ts` (the stepped builder and profile record) over
`merkavaFamilyMarks.ts` (this mark's measured record), `merkavaFamilyHull.ts` (hull loft, sponsons over the track's top
run, fenders, running gear, skirts, glacis and stern fittings), `merkavaFamilyTurret.ts` (the shell lofted from measured
stations, the bolted packages, roof equipment, basket and ball-and-chain) and `merkavaFamilyGun.ts` (the barrel as one
crisp-banded solid of revolution: tube, thermal sleeve and clamps, evacuator, muzzle; mantlet, collar and boot on
rig_gun). The 13.8k-line `merkava.ts` pile it replaces, its oracle-fit constants and its seven fit receipts are retired;
the old packet is in git history (`git show 24c5c5b039:docs/references/tanks/merkava2d.md`). Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`.

The registered comparison oracle (`public/models/tanks/community/recovered/*.glb`, tools/procedural-fidelity.html) is a
width-normalised community print with a short gun (the old packets measured its muzzle 0.4-0.9 m short of the published
length gun forward); the 262 build follows the published dimensions and the photos instead, so its print scores against
that oracle are expected to move and are reported, not chased.
