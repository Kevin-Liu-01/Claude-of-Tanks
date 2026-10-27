# ZTZ-99 Longwei — reference packet

## §262 rebuild on the ZTZ-99/99A family's proportions (release 262, owner 2026-10-27) — CURRENT

Owner, verbatim: "also update/redesign the centurions and strv 81, vickers, leopard challenger 1 mk 2, longwei, type 59,
turrets and hullls as well based on proper historical referrences so they will no longer look so chungus as well".
Standing direction (owner 2026-10-21): the Longwei is the game's own ZTZ-99-lineage concept, redesigned "in the spirit" of
the national modernization turrets (Qilin/Kunlun/Yun, Hetman II, Zubr) the owner ratified that day.

Builder: `src/vehicles/profiles/longwei.ts`; combat envelope `src/vehicles/profiles/type99Armor.ts` (`longweiArmor`).
The release-233 terraced front, its double skirt brick course, carrier, slat cage and dozer blade are retired. The
certified Type 99A print-loft structural hull (running gear, belly, glacis planes, fenders, transom, recovery tray) and
the gameplay datums (pivot 0/1.57/0.64, trunnion 0/0.3198/0.74, 6.454 m gun) are unchanged.

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
| Oracle | `public/models/community-candidates/type_99a2_armored_warfare.glb` (local-only, registered) | turret 3.45 m over modules, 4.08 m long (Object_31); hull 7.76 m, 3.70 m over skirts |

Photogrammetry (Photo F, 46 mm-equivalent, fender span 3.5 m): turret width over the side bins 3.1-3.3 m after the depth
correction; turret length with the arrowhead and basket ≈4.0-4.4 m (Photo G, low confidence); evacuator front collar
≈1.8-2.4 m from the muzzle.

### Gap table (before = release 233 terraced design on main 260; after = release 262)
| Item | ZTZ-99/99A source | Before | After |
|---|---|---|---|
| Hull length / gun forward | 7.6 m / 11.0 m | 7.81 m (with recovery tray) / 12.10 m | unchanged structural hull: 7.81 m / 12.10 m |
| Width | 3.5 m hull, 3.7 m over skirts | 3.73 m (double brick course to 1.866) | 3.73 m (single course inside 1.866) |
| Road wheels / return rollers | 6 / 3-4 hidden by skirts | 6 / 3 | unchanged |
| Turret width | 3.1-3.3 m over bins (oracle 3.45) | 3.41 m slab modules to ±1.70 | 3.14 m over the side modules (±1.57), 3.34 m to the smoke-tube tips |
| Turret length | 4.0-4.4 m (oracle 4.08 + basket) | 4.57 m | 4.16 m (cheek tips 1.45 to basket −2.71) |
| Turret roof | 2.37 m over the ground | 2.27 m (local 0.70) | 2.35 m (local 0.78) |
| Turret front | 99A arrowhead wedge cheeks with wedge-shaped dual ERA | terraced two-tier block, 16° blunt prow | two welded wedges swept 33° back from the throat, top falling 0.22 m to the front edge, six FY-5 cassettes a face |
| Mantlet | narrow slot, canvas boot, no external cast mantlet | 0.62 × 0.52 box mantlet | 0.50 × 0.45 slim cast mantlet in the 0.60 m throat, canvas boot to the tube |
| Gun | ZPT-98 125 mm, thermal sleeve, evacuator past mid-barrel | evacuator at 0.40 of the tube | evacuator at 0.55, sleeves either side, MRS kept |
| Crew layout | commander right of the gun, gunner left | commander +X (vehicle LEFT), gunner −X (mirrored) | commander −X (right) with panoramic sight and QJC-88; gunner +X (left) with his sight |
| LSDW laser dazzler | pedestal at the turret's left rear | absent | pedestal box at the left rear (+X) |
| Smoke | five tubes a side at the turret front | two four-tube banks a side on the side modules | one five-tube bank a front corner |
| Side armour | flat panels, bins with ERA on the 99A | three bolt-on spaced modules a side to ±1.70 | one slab module a side to ±1.57, two lidded bins |
| Skirts | segmented panels, scalloped lower edge, access holes | carrier + 2 brick courses + slat cage | 8 segmented scalloped panels, one FY-5 course on the front three, access holes |
| Bow | lower nose ERA row on the 99A | dozer blade under the nose | blade removed; the towing beam kept (Longwei identity) |
| Identity kept | — | GL-5-style suite, straight FY-5 glacis grid, lamp cowls, towing beam, stern bin | kept (radar faces 10% smaller) |

Combat envelope: the turret plates follow the drawn surfaces (cheek face, cheek top, mantlet, throat brow, side zones,
bins, bustle, roof); strengths carry release 233's values. The skirt ERA zone shrinks to the single course; the spaced
skirt zone now runs the full length. Crew boxes follow the 99A layout.
