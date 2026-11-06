# Leopard AS1 (`leopard_as1`) — reference packet

## Current status (release 269, 2026-11-02): a new Australian Leopard 1

Main's ruling 2026-11-02 on the owner's "flesh out south african and australian tank trees" (and "no senntinnel please"):
the Leopard AS1 is the root of the Australia tree at I, in Denmark's shape (a Leopard 1 root with its Centurion off it);
all three lines start from it, and its tier is provisional until the same-tier duels run after the regen. 90 gun tanks
delivered 1976-78 (103 with the bridgelayers and recovery vehicles), in service to July 2007. Built as the additive 'as1'
mark of the Danish line's welded-turret builder (`src/vehicles/profiles/leopard1Dk.ts`, `buildLeopardAS1`; an unknown mark
throws), on the Leopard 1A5's hull (`profiles/leopard1Hull.ts`); the seven Danish ids the edit marks proved byte-identical
by `tools/fleet-geometry-ledger.mjs --check` before and after (denmark7-before.log, denmark7-after-r1.log). In the
`australia` fleet group (`profiles/australia.ts`). Spec `src/vehicles/australiaSpecs.ts`: a clone of the Leopard 1A3 DK
(42.4 t, the MTU MB 838 of 830 PS, the 105 mm L7A3), the SABCA fire control 5 % tighter and 8 % quicker to lay than the
DK's optical rangefinder. Photo packet `docs/references/photos/aus-leopard-as1-20261102.json`; fixture
`src/vehicles/profiles/australia.selftest.mjs` (the loader's MAG 58). Implementation: DONE; qualification: the packet's
envelope PASS, regeneration and critics pending (`docs/history/research/australia-line-269.md`).

### Sources

| Key | Source |
|---|---|
| AC | https://www.armedconflicts.com/-t30969 (hull 7.090 m; 9.543 m with the gun forward; 3.370 m wide; 2.764 m overall; 0.440 m clearance; 0.550 m tracks; 42.4 t; the 105 mm L7A3; 90 built 1976-78) |
| W | https://en.wikipedia.org/wiki/Leopard_1 (the turret roof 2.39 m, 2.7 m overall; 8.29 m with the gun to the rear; the barrel L/52, about 5.46 m, calculated; 101 vehicles: 90 gun tanks, 5 AVLB, 6 + 2 ARV; in service 1976 to July 2007) |
| R | RESEARCH.md (the Belgian SABCA fire control with a laser rangefinder, the Canadian C1's; delivered in RAL 6014 yellow-olive, later the Australian three-tone; tropicalised, extra stowage, Australian turret baskets) |
| WTF | https://forum.warthunder.com/t/leopard-as1/360647 (forum: the laser in the right port and the left blanked, or a stereo rangefinder; cites a 2022 AAAM walkaround of 27771; its thermal claim doubtful) |
| TP | https://www.trackpadpublishing.com/leopard-as1 (Trackpad's *Leopard AS1* with scale drawings: not obtained **[?]**); https://tankmuseum.org/?p=53915 (an AS1 to Bovington, 2025) |
| Photos | Commons `1ARMD_Leopard_AS1.jpeg` (`front34_service_1armd`: front 3/4 in service, full stowage), `Australian_Leopard_AS1_tank_forest.jpg` (baskets, skirts), `Australian_Leopard_AS1_tank_attacking.jpg` (side detail); the Esperance tank (2019 and 2024: left profiles, front, rear, three-tone); the Canberra Services Club tank (front and rear 3/4); Defence image library (Bovington 2025, service 2000 and 2005, Edinburgh 2020); Port Kennedy (a pale-green civilian repaint: shape only) |

### Gap table (photo class)

| # | Photo read | Baseline (the Leopard 1A3 DK, 'a3') | Build |
|---|---|---|---|
| 1 | the welded spaced 1A3/1A4 turret: the wedge mantlet, flat slab sides, a long bustle | the same turret | kept (the Krigsmuseet-measured welded turret) |
| 2 | round end-caps at both rangefinder ports: a broad drum on the left cheek, a hexagonal plate on the right (`front34_service_1armd`) | the TEM 2A's open ports | the SABCA laser's armoured drum, 0.58 m across, its bolted face round a dark lens, over the left port; the right port blanked by a hexagonal plate. The forum's account (the right port live, the left blanked) is contradicted by the photograph |
| 3 | a crosswind sensor mast at the roof's front (the Esperance and service fronts); a tall box on the roof's front on the loader's side, unidentified **[?]** | the low PERI R12 | the 1A3's low PERI R12 kept; the crosswind sensor on a 0.42 m mast at the roof's right front; the loader's-side box not drawn **[?]** |
| 4 | one row of four dischargers a side at mid-side under a guard loop (the Esperance side photograph) | two rows of four a side | one row of four Wegmann tubes a side under its guard |
| 5 | no searchlight on the mask in any photograph | the XSW-30-U | none |
| 6 | the loader's MAG 58 | the Danish MG 62 (MG3) | the fleet's MAG 58 on the loader's ring (`leo1As1LoaderMag`); the Danish periscope wipers left off |
| 7 | a second pintle gun at the commander's hatch, heavier than the loader's MAG (`front34_service_1armd`) | — | an M2 on a pintle post at the cupola's front edge (`leo1As1CommanderM2`); the packet counts two roof guns |
| 8 | the bustle basket and track-guard stowage in service (`front34_service_1armd`, `front34_service_forest`) | an ammunition can on the rear bin | the Australian basket, 1.90 x 0.46 x 0.50 m, on arms from the rear bin's back, its top over the roof line |
| 9 | steel skirts with a scalloped lower edge on service tanks (most memorial tanks have lost them) | the 1A5 hull's segmented skirts | the family's straight-hemmed segments in the coat (the scallop not drawn **[?]**) |
| 10 | the glacis headlight guards, the louvred engine deck, the rear grille plate | the 1A5 hull's | kept; the Danish dozer-channel brackets and fender bins kept with them (the AS1's lower glacis and fender stowage are not settled in the notes **[?]**) |
| 11 | the Australian three-tone (olive, brown and black); a white chevron, the hull-side name plate ("ASSASSIN"), the glacis registration ("27735"); no RAL 6014 yellow-olive photograph found **[?]** | the 1970s Danish olive drab | `paint_leopard_as1` "RAAC Blotch Desert" (#8a7656 under #57593c and #262620; the line's three-tone, led by this id), number 27; the Army's kangaroo on the turret's right flank (the left cheek carries the drum); the chevron, name and registration not drawn; no RAL 6014 coat authored |

### Datums

The fleet's Leopard 1A5 hull (the Munster 1A5's datums: 0.44 m clearance, the fender and skirt top 1.12 m, the deck
1.58 m under the turret and 1.64 m at the stern, the skirts 1.678 m off the centre line) and the welded 1A3 turret (the
Krigsmuseet stations: its ring 0.50 m ahead of the hull's origin, the roof 0.87 m over the turret base, the body 1.655 m
behind the ring and the rear bin 2.18 m); the L7A3 with its thermal sleeve and evacuator 4.35 m ahead of the trunnion,
which stands 1.22 m ahead of the ring: the muzzle at hull z 6.08. As built: 9.672 m over the gun (armedconflicts 9.543 m,
1 %), 3.424 m over the skirts (3.370 m, 2 %), 4.51 m to the whips' tips (the turret roof 2.39 m published). Gun depression
(`tools/gun-depression-sweep.mjs --no-suit`): the full 9 degrees round to yaw 147; over the engine deck it rises to +0.2
degrees at yaw 167-172, and is 2.7 degrees dead astern.
