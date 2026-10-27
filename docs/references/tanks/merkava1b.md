# Merkava Mk 1B (`merkava1b`) — reference packet (release 262 family rebuild)

**Exact variant.** Merkava Siman 1 Bet: the 1982-83 refit of production Mk 1s toward Mk 2 level (BTVT, WP-RU,
WP-HE-1): the ball-and-chain curtain on a small turret basket, replaced side skirts, smoke dischargers, the exhaust
reduced to one grille on the right. **No added turret armour**; the 60 mm mortar stays **external**, on the right by the
commander's hatch; no hull rear baskets.

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

## Measurements used by the build

| Station | Value (hull frame: ground 0, hull centre 0, +Z nose) | From |
|---|---|---|
| Deck | 1.66 m; the engine deck falling from z 0.95 to 1.36 at z 3.35, nose plate to 1.24 | BP-1 side (1.67), BP-2 (1.60) |
| Belly | 0.50 m; lower glacis from z 2.95 to the nose at 1.06 | ground clearance, BP-1 |
| Road wheels | r 0.395, axles 0.475, z -2.30 -1.42 -0.46 0.46 1.42 2.30 | 790 mm; BP-1 pitch (~0.98 m) vs the 4.52 m ground length |
| Sprocket / idler | z 3.20 y 0.86 r 0.31 / z -3.12 y 0.80 r 0.30 | BP-1 (0.50 m behind the nose, 0.6 m inside the stern) |
| Tracks | 0.64 m, centres at +-1.53 (outer faces at +-1.85 = 3.70 m) | published width without skirts |
| Turret | ring 1.25 m aft of the hull centre; nose (gun) 2.50 m ahead of the ring at z 1.25; roof crown 0.84 over the deck (2.50 m); ears to +-1.32 | BP-1/BP-2 side and plan, photos |
| Gun | trunnion 2.10 m ahead of the ring at 2.02 m; muzzle at z 4.905 (8.63 m gun forward); evacuator 0.55 m centred 0.65 m ahead of the nose | published length, PHOTO, BP-1 (gun axis 2.02) |

## Gap table: the old pile vs the sources vs the 262 build

| Feature | Old pile (release 260) | Sources | 262 build |
|---|---|---|---|
| Gun length | muzzle 1.30 m past an oracle nose at +3.05 (8.29 m gun forward in a shifted frame); trunnion-to-muzzle 5.11 m against a mantlet buried in an oracle-fit casting | 8.63 m gun forward; M68 5.35 m tube | muzzle at z 4.905 (8.63 m), 4.06 m trunnion to muzzle, full sleeve and evacuator |
| Turret armour | eight invented "ERA" cells on each cheek, registered as removable packages | none added in the 1B refit (BTVT, WP-RU) | no packages; the spec's two turret plates stay (owner decision, see below) |
| Mortar | roof pots/cans seated by oracle rays | external 60 mm on the right by the commander | external mortar on its cradle at the right |
| Skirts | narrow fender-line plates, wheels open | the refit's six-section skirts to hub height | six panels to 0.56-0.58 m |
| Running gear | wheels r 0.355, five rollers, oracle course | 790 mm wheels, 5 rollers (WP-RU) | r 0.395, 5 rollers |
| Turret shape | oracle-fit rising-roof casting with fit receipts | narrow wedge with ears | lofted arrowhead with ears |
| Depression | -0.7..-2.4 deg over the glacis (published curve) | -8.5 deg | full spec depression over the front arc (receipt) |

**Owner decision (reported, not made here).** The spec (`additionalFleetSpecs.ts`) still registers two single-use turret
plates (`merkava_merkava1b_turret_era_R/L`) for the 1B. The sources say the 1B carried no added turret armour, so the 262
build draws none and binds none; removing the plates would lower the 1B's protection and is a stat change for the owner.

## Build route (release 262)

One family builder draws the six marks: `src/vehicles/profiles/merkava.ts` (the stepped builder and profile record) over
`merkavaFamilyMarks.ts` (this mark's measured record), `merkavaFamilyHull.ts` (hull loft, sponsons over the track's top
run, fenders, running gear, skirts, glacis and stern fittings), `merkavaFamilyTurret.ts` (the shell lofted from measured
stations, the bolted packages, roof equipment, basket and ball-and-chain) and `merkavaFamilyGun.ts` (the barrel as one
crisp-banded solid of revolution: tube, thermal sleeve and clamps, evacuator, muzzle; mantlet, collar and boot on
rig_gun). The 13.8k-line `merkava.ts` pile it replaces, its oracle-fit constants and its seven fit receipts are retired;
the old packet is in git history (`git show 24c5c5b039:docs/references/tanks/merkava1b.md`). Receipts:
`src/vehicles/profiles/merkavaFamily.selftest.mjs`, `merkavaFamilyGunClearance.selftest.mjs`.

The registered comparison oracle (`public/models/tanks/community/recovered/*.glb`, tools/procedural-fidelity.html) is a
width-normalised community print with a short gun (the old packets measured its muzzle 0.4-0.9 m short of the published
length gun forward); the 262 build follows the published dimensions and the photos instead, so its print scores against
that oracle are expected to move and are reported, not chased.
