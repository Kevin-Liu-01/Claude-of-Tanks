# Merkava Mk 3C (`merkava3c`) — reference packet (release 262 family rebuild)

**Exact variant.** War Thunder's "Merkava Mk.3C" is the Israeli **Mk 3B Baz** (1995/96): the Mk 3B's improved turret
modules with the Baz (Barak Zohar) fire control, its fez-shaped independent commander's sight, the taller gunner's sight
and the round loader's hatch; flat bolted turret modules, rubber-tyred road wheels, no protruding Dor Dalet cheeks. No
Israeli source uses "3C" (FACTS: WP-HE-M, WP-RU, BTVT; [WT] naming only).

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

## Measurements used by the build

| Station | Value | From |
|---|---|---|
| Deck | 1.69-1.72 m, the engine deck falling to 1.42 m at z 3.41, the nose plate to 1.10 | X-3D roof rays, re-centred on 7.60 m |
| Belly | 0.48 m | ground clearance 0.45-0.53 |
| Road wheels | r 0.395, axles 0.475, z -2.32 -1.44 -0.31 0.55 1.41 2.26 | X-3D stations, 790 mm |
| Sprocket / idler | z 3.266 / -3.139 | X-3D |
| Tracks | 0.66 m, centres +-1.53 (outer faces +-1.86 = 3.72 m) | published width |
| Turret | ring 0.90 m aft of the hull centre; nose 2.32 m ahead of it; flat sides to +-1.45 under 10 cm modules; roof 0.86-0.88 over the deck | BP-3, X-3D sections, Latrun photos |
| Gun | trunnion 1.92 m ahead of the ring at 2.09 m; muzzle at z 5.24 (9.04 m); evacuator 0.60 m centred 0.95 m ahead of the nose | published length, PHOTO, BP-3 |

## Gap table: the old pile vs the sources vs the 262 build

| Feature | Old pile (release 260) | Sources | 262 build |
|---|---|---|---|
| Gun length | muzzle at +4.58 (oracle nose +3.33: 8.74 m in a shifted frame); 5.36 m trunnion-to-muzzle through an oracle casting | 9.04 m | muzzle z 5.24 (9.04 m), 4.22 m trunnion to muzzle |
| Over-gun 12.7 | — | LIC kit only | none |
| Turret packages | 18 cells a side on an outer carrier ring | flat bolted modules | flat side and cheek modules, the spec's two packages |
| Rear | oracle rack | armoured fuel tanks + baskets | both |
| Depression | -1.7..-3.4 deg over the front | -7 deg (spec 8) | full spec depression over the front arc |

## Build route (release 262)

One family builder draws the six marks: `src/vehicles/profiles/merkava.ts` (the stepped builder and profile record) over
`merkavaFamilyMarks.ts` (this mark's measured record), `merkavaFamilyHull.ts` (hull loft, sponsons over the track's top
run, fenders, running gear, skirts, glacis and stern fittings), `merkavaFamilyTurret.ts` (the shell lofted from measured
stations, the bolted packages, roof equipment, basket and ball-and-chain) and `merkavaFamilyGun.ts` (the barrel as one
crisp-banded solid of revolution: tube, thermal sleeve and clamps, evacuator, muzzle; mantlet, collar and boot on
rig_gun). The 13.8k-line `merkava.ts` pile it replaces, its oracle-fit constants and its seven fit receipts are retired;
the old packet is in git history (`git show 24c5c5b039:docs/references/tanks/merkava3c.md`). Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`.

The registered comparison oracle (`public/models/tanks/community/recovered/*.glb`, tools/procedural-fidelity.html) is a
width-normalised community print with a short gun (the old packets measured its muzzle 0.4-0.9 m short of the published
length gun forward); the 262 build follows the published dimensions and the photos instead, so its print scores against
that oracle are expected to move and are reported, not chased.
