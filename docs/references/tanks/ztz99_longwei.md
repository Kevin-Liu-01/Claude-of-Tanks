# ZTZ-99 Longwei — reference packet

## §262 rebuild on the ZTZ-99/99A family's proportions (release 262, owner 2026-10-27) — CURRENT

Owner, verbatim: "also update/redesign the centurions and strv 81, vickers, leopard challenger 1 mk 2, longwei, type 59,
turrets and hullls as well based on proper historical referrences so they will no longer look so chungus as well".
Standing direction (owner 2026-10-21): the Longwei is the game's own ZTZ-99-lineage concept, redesigned "in the spirit" of
the national modernization turrets (Qilin/Kunlun/Yun, Hetman II, Zubr) the owner ratified that day.

Builder: `src/vehicles/profiles/longwei.ts`; combat envelope `src/vehicles/profiles/type99Armor.ts` (`longweiArmor`,
`longweiHullPlates`). Owner, 2026-10-27, mid-lane: "longweii needs a completely new hhull too" — the certified print-loft
hull of releases 232-261 is retired with the release-233 terraced front, its double skirt brick course, carrier, slat
cage and dozer blade. Kept: the six measured wheel stations and the gameplay datums (pivot 0/1.57/0.64, trunnion
0/0.3198/0.74, 6.454 m gun), so the turret's ring seat and the 1.78 m powerpack deck it clears hold.

### Sources
| Key | Source | Used for |
|---|---|---|
| WP-99 | en.wikipedia.org/wiki/Type_99_tank | 7.6 m hull, 11.0 m gun forward, 3.7 m over skirts, 2.35 m, 6 road wheels, arrow-shaped 99A turret |
| ZHWP-99 | zh.wikipedia.org/wiki/99式主战坦克 | 7.6 / 11.0 / 3.5 / 2.37 m, enlarged 99A turret front |
| MND-2012 | mnd.gov.tw/File/16229 (ROC Army journal comparison, table 1) | 7.6 m, 3.5 m without skirts, 2.37 m, LSDW range |
| MND-2022 | ROC Army study of the ZTZ-99A (mnd.gov.tw, 2022) | commander right of the gun, LSDW at the turret's left rear, 50-cal ZPT-98, wedge-shaped dual ERA on the cheeks |
| AR-99A | armyrecognition.com Type 99A/99A2 page | 4 return rollers, LSDW behind the gunner's hatch, five smoke tubes a side, rear basket |
| AT-99 | army-technology.com Type 99 page | welded angular turret, thermal sleeve and evacuator, 2.2-3.4 m alternates |
| Photo F | commons: `ZTZ-99A_tank_front_20170902.jpg` (Tyg728, CC BY-SA 4.0) | straight front: arrowhead cheeks, glacis ERA, LSDW pedestal (vehicle left rear), commander's sight (right) |
| Photo G | commons: `ZTZ-99A_MBT_20170716.jpg` (Tyg728, CC BY-SA 4.0) | left side from the front: skirts with scalloped lower edge and access holes, bins, bustle, evacuator past mid-barrel |
| Photo H | commons: `Type_99_MBT_front_right.jpg` (Max Smith, PD) | base 99: welded turret sides, QJC-88, skirts |
| Photo I | commons: `Type_99_MBT_rear.jpg` (Max Smith, PD) | bustle basket, rear plate |
| Oracle (retired 2026-10-28) | `public/models/community-candidates/type_99a2_armored_warfare.glb` (local-only; guidance only since the concept registration) | turret 3.45 m over modules, 4.08 m long (Object_31); hull 7.76 m, 3.70 m over skirts |

Photogrammetry (Photo F, 46 mm-equivalent, fender span 3.5 m): turret width over the side bins 3.1-3.3 m after the depth
correction; turret length with the arrowhead and basket ≈4.0-4.4 m (Photo G, low confidence); evacuator front collar
≈1.8-2.4 m from the muzzle.

### Gap table (before = release 233 terraced design on main 260; after = release 262)
| Item | ZTZ-99/99A source | Before | After |
|---|---|---|---|
| Hull length / gun forward | 7.6 m / 11.0 m | 7.81 m (with recovery tray) / 12.10 m | 7.58 m (stern rack to nose) / 11.80 m (the pinned 6.454 m gun on the pinned ring) |
| Nose and glacis | pointed T-72/99 nose: long shallow upper glacis (~22°), steep lower glacis | 16.3° upper plate, 62° nose plate and a near-vertical lower bow (a 0.83 m front wall) | nose at 0.92 m where a 21.9° upper glacis meets a 52° lower glacis |
| Belly / tub | ~0.45-0.5 m clearance, tub between the tracks | raised tub at 0.68 m with a lower bow lane to 0.385 | 2.20 m tub over a 0.47 m belly |
| Sponsons, deck | sponsons over the tracks, roof ~1.5 m, raised engine deck | slab sponson band, shoulder skins | ±1.70 m sponsons with shoulders sloped behind the fender boxes, 1.50 roof, 1.78 powerpack deck |
| Rear | inclined rear plate with a large access grille | split transom, recovery tray to −4.25 | inclined rear plate with a 7-slat access grille, lamps, tow hooks, stern rack with the bin |
| Width | 3.5 m hull, 3.7 m over skirts | 3.73 m (double brick course to 1.866) | 3.73 m (single course inside 1.866) |
| Road wheels / return rollers | 6 / 3-4 hidden by skirts | 6 / 3 | unchanged |
| Turret width | 3.1-3.3 m over bins (oracle 3.45) | 3.41 m slab modules to ±1.70 | 3.14 m over the side modules (±1.57), 3.34 m to the smoke-tube tips |
| Turret length | 4.0-4.4 m (oracle 4.08 + basket); the basket reaches toward the stern | 4.57 m | 4.15 m to the rear wall (−2.60), the 0.62 m basket to −3.21 (world −2.57, 1.39 m short of the stern) |
| Turret roof | 2.37 m over the ground | 2.27 m (local 0.70) | 2.35 m (local 0.78) |
| Turret front | 99A arrowhead wedge cheeks with wedge-shaped dual ERA | terraced two-tier block, 16° blunt prow | two welded wedges swept 37° off square from the throat to the side modules' faces (±1.57), standing 0.20-0.62 m over a 0.10 m lean, a dark seam at each wedge's joint with its module, two large dual-reactive modules a face |
| Mantlet | narrow slot, canvas boot, no external cast mantlet | 0.62 × 0.52 box mantlet | 0.50 × 0.45 slim cast mantlet in the 0.60 m throat, canvas boot to the tube |
| Gun | ZPT-98 125 mm, thermal sleeve, evacuator past mid-barrel | evacuator at 0.40 of the tube | evacuator at 0.55, sleeves either side, MRS kept |
| Crew layout | commander right of the gun, gunner left | commander +X (vehicle LEFT), gunner −X (mirrored) | commander −X (right) with panoramic sight and QJC-88; gunner +X (left) with his sight |
| LSDW laser dazzler | pedestal at the turret's left rear | absent | pedestal box at the left rear (+X) |
| Smoke | five tubes a side at the turret front | two four-tube banks a side on the side modules | one five-tube bank on each wedge's outer face, fanned forward, up and out |
| Side armour | flat panels, bins with ERA on the 99A | three bolt-on spaced modules a side to ±1.70 | one slab module a side to ±1.57, two lidded bins |
| Skirts | segmented panels, scalloped lower edge to about hub height, access holes | carrier + 2 brick courses + slat cage | 8 segmented panels with the lower edge at 0.50 m scalloped up over each wheel, a closed nose, one FY-5 course on the front three, access holes |
| Bow | lower nose ERA row on the 99A, headlights on the fender boxes | dozer blade, 0.14 m towing beam, glacis lamp cowls | four appliqué boxes on the lower glacis, a slim towing bar under the nose, lamps on the fender boxes |
| Identity kept | — | GL-5-style suite, straight FY-5 glacis grid, lamp cowls, towing beam, stern bin | kept (radar faces 10% smaller) |

Combat envelope: the turret plates follow the drawn surfaces (cheek face, cheek top, mantlet, throat brow, side zones,
bins, bustle, roof); strengths carry release 233's values. The skirt ERA zone shrinks to the single course; the spaced
skirt zone now runs the full length. Crew boxes follow the 99A layout.

Fairness (balance range, shown-tier VI MBT peers): before (main 260) mean 0.681, 8/15 pairs inside 0.2-0.8; after
(the final build) mean 0.561, 8/15. Stats unchanged. The arrowhead's raked top takes most frontal hits on the balance
range, so its rating sets the pair outcomes: rated as the face (700 mm) the Longwei swept its tier (0.80, 3/15), at
400 mm or less it lost it (0.35, 3/15); 560 mm (KE 490, CE 690) is the fair point. (modern2Specs.generated.ts carries
the plates: regenerate it after any type99Armor edit.)

Main gun by yaw (measured on the new hull, `tools/gun-depression-sweep.mjs --ids=ztz99_longwei`, no mount conflict): the
full 7° except over the front quarters (the fender boxes and lamps hold it to −3.1° to −4.6° at 21-33°) and over the
powerpack deck from 136°, where it stays 0.4-2.9° above level.

Turret after the critic rounds (262, against the ZTZ-99A photographs): vertical arrowhead faces whose front-top edge
falls from 0.62 m at the outer corner to 0.28 m at the gun throat under one planar top (the 99A's narrowing face and
raked beak), the outer corners flush with the side modules (±1.57) and a seam at each module; the side modules' lower
lip just over the deck rising to clear the powerpack ramp on traverse; a floor across the throat under the mantlet; the
core 0.30 m longer with a 0.62 m basket; two three-tube smoke banks stacked on each block's outer face. Skirts reach
the hubs with angular notches and 3 cm V-gaps; the front fender hoods are closed over the idler. Blind critic: 4 → 4 →
5 → 5 → 6/10 PASS. Open notes (follow-ups): a turret-rear stowage drum, the lower nose corner over the idler, the rear
sprocket behind the skirt, taller front mudguard boxes with headlights (moves the measured depression curve).

Track clip (262 release gate, strict exact audit): 54 band cells and 2 pad cells → 0/0. The skirt's bow end plate now
starts at 1.81, outside the belt's outer face (1.788), and the glacis FY-5 columns sit at 0.375 / 0.68 / 0.985 with
0.29 m bricks, so the outer column ends at 1.13, inside the belt's inner face (1.158), where the belt climbs the idler.

First-party concept route (owner 2026-10-28, relayed by Main): the Longwei is an original design, so it is registered
as a first-party concept (`docs/references/concepts/ztz99-longwei-20261028.json`, the `FIRST_PARTY_CONCEPTS` row in
`tools/first-party-concept-policy.mjs`) instead of being scored against the ZTZ-99A2 Armored Warfare print (88.1/92 on
the last committed packet, 88.3 in the 262 lane; the packet stays as the historical receipt). The concept is held to
its pinned datums (ring 0/1.57/0.64, trunnion 0/0.3198/0.74, the 6.454 m 125 mm gun, −7/+14, one roof gun), its measured
envelope within 3% at both qualities (3.732 m wide, 11.811 m long, 3.668 m to the whip tips) and its native fixture
`src/vehicles/profiles/longwei.selftest.mjs` (hull, skirts, turret, basket, commander's station, muzzle and a closed
roof at both qualities). Its variants are unchanged; the ZTZ-99A2 and the VT-4A1 keep their own comparison registrations.
