# T-90 family (`t90_1992`, `t90a_2004`, `t90a_2006`, `t90am`, `t90m_proryv`, `t90ms_2011`, `t90sm_2013`, `t90a_burlak_proto`, `bmpt_t90`)

Lane `item/t90-family-266` (release 266). The owner, 2026-10-30: "in the same way weve updated our old leopard 2,s we
should update our t90ms obr 2011, obr 2013, t90am, t90a 2006, obr 2004, burrlak prototype, obr 1992, andd t90AM 2 to be
cleaned up and updated significantly bc those models are a little old and rough (save for the bulak prototype which is
relatively nnewer and cleaner)", and then: "just update all the hulls based on what they share already, including
updating the bmpt t90". Identity and variant calls are Main's under the owner's delegation (rulings recorded below).

The source-X builds (`t90`, `t90a`, `t90a_burlak`, `t90a_vladimir`, `t90m`, `t90ms_tagil`, `t90sm`) are the earlier
marks' bases; under Main's ruling A they move with them (the rear drums below). `pt91m` builds from another pack.

## Outcome

Three steps, all in the lane's history:

1. **One family chassis** (Main's rulings below): the six print-fitted lofts in `profiles/t90.ts` collapsed onto one
   T-90 family chassis with Kontakt-5 or Relikt fits, the obr. 1992 on a cast turret, the AM-type marks on one turret.
   The first blind-critic round still scored 4-5/10 (turrets low and flat, no mantlets, reduced weapon stations).
2. **The source-X twins** (the owner, 2026-10-30: "for all of these we can just take inspirration annd update from the
   later t90s we added that have far more accurate models"). Each earlier mark now builds from its matching source-X
   build, whose builders are called unchanged:

| Mark | Builds from | Own deltas kept |
|---|---|---|
| T-90 obr. 1992 (`t90_1992`) | T-90 (`t90`, `profiles/t90AwX.ts`, cast turret, Shtora, K-5) | kit, camouflage, markings, 1.05 installed size |
| T-90A obr. 2004 (`t90a_2004`) | T-90A (`t90a`, `profiles/t90X.ts`) | as above |
| T-90A obr. 2006 (`t90a_2006`) | T-90A Vladimir (`t90a_vladimir`, the obr. 2006 production name) | as above |
| T-90MS obr. 2011 (`t90ms_2011`) | T-90MS Tagil (`t90ms_tagil`, `profiles/t90msX.ts`) | as above |
| T-90SM obr. 2013 (`t90sm_2013`) | T-90SM (`t90sm`) | as above |
| T-90AM (`t90am`) | T-90SM (`t90sm`; AM, MS and SM are one design) | the owner's field net and garnish (refitted) |
| T-90AM II (`t90m_proryv`) | T-90M (`t90m`, the T-90M Proryv-3) | as above |
| T-90A Burlak prototype (`t90a_burlak_proto`) | the T-90A X hull and running gear | its own Burlak turret, unchanged (light touch) |
| BMPT T-90 (`bmpt_t90`) | the T-90M X hull (Relikt skirts, rear slat) | its Terminator station, AG-17 pods |

`profiles/t90.ts`: 8,386 lines to 768 (the Burlak turret and the X wiring). The AM and AM II 1.10 chassis length
retired with the move (Main: the X proportions are measured; owner commit 245aa4e4e recorded no reason for it).

3. **Each mark's own fittings** (the owner, 2026-10-30: "our new versiosn now just look way too identical to sources.
   tone down that copying a lil", then "we can also make new turrets, layerring onn top, hull modificaitons, track
   shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages, shtora or otherr quipmennt, machine
   guns"). Each earlier mark lays an equipment kit on its twin (`profiles/t90Mark*.ts`; no armour, gun, station or
   running-gear change) and carries its own crew load (`decorations.ts`):

| Mark | Own fittings | Basis |
|---|---|---|
| obr. 1992 | Commander's OU-3GA2M and driver's IR lamps, front/rear mud flaps, rubber fringe under the screens, fender ZIP boxes, turret rear-corner bins | The first T-90s kept the T-72B's IR lamps and stowage |
| obr. 2004 | Rubber skirt flaps, bow mud flaps, fender crew boxes, tube rack on the turret-rear box, grab handles | Garrison and parade fit |
| obr. 2006 | Field slat round the engine bay, slat off the turret-rear box, open turret basket, stern log, Kord ammunition box | The 2022-24 field fit |
| T-90MS obr. 2011 | No Shtora (the T-90MS has none); laser-warning heads on the housings, closed bustle bins with snorkel, rear skirt flaps, bow flaps, lamp guards | REA-2011 show tank |
| T-90SM obr. 2013 | Air-conditioner housing on the bustle, full rubber dust skirts, long rear flaps, sight sun hood, bustle case | Export, hot-climate fit |
| T-90AM | Stern bar cage with log, front/rear flaps, fender tool box, under the owner's field net | 2022+ rear slat practice |
| T-90AM II | Anti-drone roof cage, Volnorez-type EW jammer, second mast, forward side slat, stern log | T-90M Proryv-3 in 2022-24 service |

   `t90XTwins.selftest.mjs` holds both halves: each mark keeps at least 90 % of its twin's parts (all keep 96.5-100 %)
   and carries at least 12 of its own.

Main's polish ruling on the shared X builders (2026-10-30): the four empty rear drum cradles of the T-90, T-90MS and
T-90SM builds read as hooks or tusks, so two 200 L drums ride each pair (`t90CradleDrums.ts`); the T-90A Vladimir's
732 mm drums became 585 mm 200 L drums. The T-90A obr. 2004 sheds its birch garnish.
2026-10-31 (Main: the gate measures against what the build follows): with the certified source oracles restored, the
drums lengthened the T-90, T-90MS and T-90SM hulls past their references (geometry gate: T-90 94.4 -> 55.4, Tagil 92.2
-> 55.2, SM 92.2 -> 75.7). The source-X builds keep their references' empty cradles again; the drums ride the earlier
marks in their own kits (obr. 1992, MS 2011, SM 2013, AM), each with its cradle mounting plates.

## Measured datums (builder frame, before the 1.05 installed scale)

From the near-orthographic side photograph of a T-90A (`t90a-2006/5-side-right`, Army-2014, scaled by the 0.75 m road
wheels) and the T-90 obr. 1992 side photographs (`t90-1992/3-side-left`, Vitaly Kuzmin): deck about 1.55 m, fender and
side top 1.51 m, skirt bottom 0.80 m (level with the road-wheel tops), front K-5 skirt panels 0.80-1.46 m, turret roof
2.24 m (btvt publishes 2,228 mm to the turret roof). The family chassis: deck plateau 1.495 m (1.545 construction less
the 50 mm family datum), fender shelves 1.44 m, skirt 0.80-1.44 m, turret ring `T90_FAMILY_RING_Y` = 1.46 m, cast
turret crown 2.23 m. Hull 6.86 m construction length (btvt 6,917 mm; Wikipedia 6.86 m), 3.78 m over the side screens.

## Per-mark identity (sources in the table at the end)

| Mark | Turret | Turret front | Shtora | Commander's weapon | Bustle | Hull sides | Build |
|---|---|---|---|---|---|---|---|
| T-90 obr. 1992 | Cast (T-72B base) [btvt-T90] | Kontakt-5 V blocks, 7 containers + 1 block; 21 roof containers [btvt-T90] | Yes, two TShU-1-7 [btvt-T90] | 12.7 mm NSVT on the hatch, remotely fired [btvt-T90] | No | Full-length skirt, K-5 front panels [btvt-T90; AR-T90; photos]; no slat | `t90` (source-X) |
| T-90A obr. 2004 | Welded, 950 mm frontal elements [Kubinka] | K-5 as the T-90 [btvt-T90A] | Yes [btvt-T90A] | NSVT or Kord, remote [Kubinka] | No | As the T-90 [btvt-T90A] | `t90a` (source-X) |
| T-90A obr. 2006 | As 2004 | As 2004 (4S23 inserts, internal) | Yes | As 2004 | No | As 2004 | `t90a_vladimir` (source-X); Buran-M to ESSA is internal [Kubinka; AW-T90A] |
| T-90AM | New welded module [btvt-T90SM] | Relikt, modular [btvt-T90SM; btvt-REA2011] | No | UDP T05BV-1 with 7.62 mm PKTM [btvt-REA2011] | Yes, blow-out plates [btvt-T90SM] | Split full-length screens; slat at hull and turret rear [btvt-REA2011] | `t90sm` (source-X) |
| T-90AM II (T-90M Proryv-3) | New all-welded [AR-T90M] | Relikt front module; net screens round the lower turret (photos) | No (laser warning kept) | Remote 12.7 mm Kord [WM-2020] | Yes | ERA over the front half, slat over the rear half (photos; AR-T90M) | `t90m` (source-X) |
| T-90MS obr. 2011 | Same as T-90AM [UVZ-T90MS; AT-T90MS] | Relikt | No | PKTM station | Yes | As T-90AM | `t90ms_tagil` (source-X) |
| T-90SM obr. 2013 | Same as T-90MS in the photographs | Relikt | No | Station | Yes | As T-90AM | `t90sm` (source-X) |
| T-90A Burlak prototype | Game construct: the Burlak module on a T-90A [AW-Burlak]; the real prototype was on a T-72B [btvt-Burlak] | Wedge ERA | — | — | Large removable autoloader container | T-72B skirts on the real prototype | T-90A X hull; its own turret unchanged |
| BMPT T-90 | Unmanned weapons module, 2 x 2A42, 4 Ataka-T [wiki-en-BMPT] | Relikt on hull and module | No | — | — | Full-length ERA box skirts plus slat [btvt-BMPT; photos] | T-90M X hull + the Terminator station |

Chassis of the 2018 BMPT batch: Interfax (2017) and BFM (2018) say T-90A units; the archived Uralvagonzavod page and
English Wikipedia say a modernised T-72. The game keeps it on the T-90 family chassis.

## Rulings (Main, under the owner's delegation, 2026-10-30)

1. Do not build a new hull; update what the marks share, in place, including the BMPT T-90.
2. `t90_1992` takes the existing cast-turret branch: no bustle, no slat cage, the 1992 tank's K-5 and Shtora.
3. `t90a_2006` is the shared T-90A build (its private hull and turret retire); `t90ms_2011`'s turret moves to the AM-type
   steps with no Shtora; `t90sm_2013` moves onto the family hull builder (no photographed hull difference).
4. Fix the AM's 160 mm ride lift and the 65 % turret scale in the shared steps, not as per-id offsets.
5. Option 1: the T-90A build goes onto the family chassis, one hull for all nine. The Burlak proto's hull rising with it is
   a correctness fix; its own turret stays untouched.
6. After the owner's message: each mark builds from its source-X twin by the mapping above; the X ids stay
   byte-identical; the family chassis, cast and AM-type turret code retire; the AM / AM II drop the 1.10 length.
7. Ruling A: polish the shared X builders in place so all sixteen ids move together (the byte-identical condition is
   lifted for shared builders); each mark then takes its own kit (the owner's later messages).

## Open questions and unknowns

- No source publishes a turret width or height for any mark; turret plans stay as built (cast loft, T-90A welded, AM-type).
- No external 2004/2006 difference is published; the two marks share one look on purpose.
- AM / MS / SM: sources use the names interchangeably for one design; no external difference between the 2011 and 2013
  export tanks beyond paint.
- T-90M main gun (2A46M-4 / 2A46M-5 / 2A82-1M) and weight (46.5 / 48 / 50 t) conflict; combat data is unchanged here.
- Bustle load: btvt says 10 rounds, Wikipedia 8.

## Sources

| Key | URL |
|---|---|
| btvt-T90 | http://btvt.info/1inservice/t-90_v_strou.htm |
| btvt-T90A | http://btvt.info/1inservice/t-90A/t-90A.htm |
| btvt-REA2011 | http://btvt.info/6photos/tagil2011/2011.htm |
| btvt-T90SM | http://btvt.info/1inservice/tom3_t-90sm.htm |
| btvt-Burlak | http://btvt.info/2futureprojects/omsk_turret.htm |
| btvt-BMPT | http://btvt.info/1inservice/bmpt.htm |
| wiki-en-T90 | https://en.wikipedia.org/wiki/T-90 |
| wiki-ru-T90 | https://ru.wikipedia.org/wiki/Т-90 |
| wiki-en-BMPT | https://en.wikipedia.org/wiki/BMPT_Terminator |
| AR-T90 | https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/t-90-russia-uk |
| AR-T90M | https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/t-90m-model-2017-mbt-main-battle-tank-technical-data-sheet |
| AT-T90MS | https://www.army-technology.com/projects/t-90ms-main-battle-tank/ |
| UVZ-T90MS | https://web.archive.org/web/20220121050509/http://uralvagonzavod.ru/product/70/57 |
| UVZ-BMPT | https://web.archive.org/web/20191210205543/http://uralvagonzavod.ru/product/70/39 |
| Interfax-2017 | https://www.interfax.ru/russia/580076 |
| BFM-2018 | https://www.bfm.ru/news/381667 |
| AW-T90A | https://armoredwarfare.com/en/node/4851 |
| AW-Burlak | https://armoredwarfare.com/en/news/general/development-t-90a-burlak |
| Bellingcat | https://www.bellingcat.com/news/europe/2017/04/02/tankspotting-t-90as-donbass/ |
| Kubinka | https://commons.wikimedia.org/wiki/File:Soviet_and_Russian_vehicles_in_Kubinka_tank_museum_361.jpg |
| WM-2020 | https://warriormaven.com/land/the-russian-army-just-received-its-first-new-t-90m-proryv-tanks |

Reference photographs (54, six a mark) were studied from Wikimedia Commons (CC / public domain), btvt.info and
armoredwarfare.com; the latter two carry no stated licence and stay internal. None are committed; the lane evidence
folder keeps them with an index of source pages, authors and licences.
