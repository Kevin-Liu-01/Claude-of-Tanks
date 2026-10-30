# T-90 family (`t90_1992`, `t90a_2004`, `t90a_2006`, `t90am`, `t90m_proryv`, `t90ms_2011`, `t90sm_2013`, `t90a_burlak_proto`, `bmpt_t90`)

Lane `item/t90-family-266` (release 266). The owner, 2026-10-30: "in the same way weve updated our old leopard 2,s we
should update our t90ms obr 2011, obr 2013, t90am, t90a 2006, obr 2004, burrlak prototype, obr 1992, andd t90AM 2 to be
cleaned up and updated significantly bc those models are a little old and rough (save for the bulak prototype which is
relatively nnewer and cleaner)", and then: "just update all the hulls based on what they share already, including
updating the bmpt t90". Identity and variant calls are Main's under the owner's delegation (rulings recorded below).

The source-X builds (`t90`, `t90a`, `t90a_burlak`, `t90a_vladimir`, `t90m`, `t90ms_tagil`, `t90sm`) and `pt91m` build
from other packs and are not touched.

## Outcome

| Before | After |
|---|---|
| Six `loftHull` calls in `profiles/t90.ts`, each fitted to a different community print (the T-90 family hull, the T-90A loft, the Vladimir loft built in a shifted frame, the old Proryv loft, the SM loft, a copy inside the MS) | **One hull**, `addT90FamilyChassis(P, 'kontakt5' \| 'relikt')`, for all nine |
| obr. 1992 on the Burlak prototype's welded core with its autoloader bustle, tall slab skirts and a slat cage | The production cast turret; K-5 horseshoe and Shtora; full-length skirt with three K-5 panels; no cage, no bustle |
| obr. 2006 on a private hull and an open "tub" turret with a long bustle | The shared T-90A build; sources give no external 2004/2006 difference, so the identical look is intended |
| T-90AM / AM II built a hull, cleared it, rebuilt it 200 mm low, lifted the hull buckets 160 mm and squashed the turret to 65 % of its height | Family chassis (Relikt) and the AM-type turret at full scale; the owner's 1.10 hull length and the AM's ghillie suit stay |
| T-90MS wore the old Shtora turret with a rail basket | The AM-type turret (no Shtora) on the family chassis |
| T-90SM on its own loft | The family chassis (no hull difference in the photographs) with the AM-type turret |
| T-90A, Burlak proto and BMPT on the T-90A loft (deck 1.365 m, 16 cm skirt band) | The family chassis; the Burlak's own turret is untouched; the BMPT takes the Relikt fit and its station seats on the family deck |

`profiles/t90.ts`: 8,386 lines to about 3,200.

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
| T-90 obr. 1992 | Cast (T-72B base) [btvt-T90] | Kontakt-5 V blocks, 7 containers + 1 block; 21 roof containers [btvt-T90] | Yes, two TShU-1-7 [btvt-T90] | 12.7 mm NSVT on the hatch, remotely fired [btvt-T90] | No | Full-length skirt, K-5 front panels [btvt-T90; AR-T90; photos]; no slat | family chassis `kontakt5` + cast turret steps |
| T-90A obr. 2004 | Welded, 950 mm frontal elements [Kubinka] | K-5 as the T-90 [btvt-T90A] | Yes [btvt-T90A] | NSVT or Kord, remote [Kubinka] | No | As the T-90 [btvt-T90A] | family chassis `kontakt5` + T-90A welded turret |
| T-90A obr. 2006 | As 2004 | As 2004 (4S23 inserts, internal) | Yes | As 2004 | No | As 2004 | same build as 2004 (Buran-M to ESSA is internal [Kubinka; AW-T90A]) |
| T-90AM | New welded module [btvt-T90SM] | Relikt, modular [btvt-T90SM; btvt-REA2011] | No | UDP T05BV-1 with 7.62 mm PKTM [btvt-REA2011] | Yes, blow-out plates [btvt-T90SM] | Split full-length screens; slat at hull and turret rear [btvt-REA2011] | family chassis `relikt` + AM-type turret |
| T-90AM II (T-90M Proryv-3) | New all-welded [AR-T90M] | Relikt front module; net screens round the lower turret (photos) | No (laser warning kept) | Remote 12.7 mm Kord [WM-2020] | Yes | ERA over the front half, slat over the rear half (photos; AR-T90M) | family chassis `relikt` (modules to z 0.20) + AM-type turret + net screens |
| T-90MS obr. 2011 | Same as T-90AM [UVZ-T90MS; AT-T90MS] | Relikt | No | PKTM station | Yes | As T-90AM | as T-90AM |
| T-90SM obr. 2013 | Same as T-90MS in the photographs | Relikt | No | Station | Yes | As T-90AM | as T-90AM |
| T-90A Burlak prototype | Game construct: the Burlak module on a T-90A [AW-Burlak]; the real prototype was on a T-72B [btvt-Burlak] | Wedge ERA | — | — | Large removable autoloader container | T-72B skirts on the real prototype | family chassis `kontakt5`; its own turret unchanged |
| BMPT T-90 | Unmanned weapons module, 2 x 2A42, 4 Ataka-T [wiki-en-BMPT] | Relikt on hull and module | No | — | — | Full-length ERA box skirts plus slat [btvt-BMPT; photos] | family chassis `relikt` + the Terminator station |

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
