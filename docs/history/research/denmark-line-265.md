# Denmark line (release 265)

Owner request, 2026-10-29: "add a bunch more denmark tanks". Lane `item/denmark-line-265`. Main ruled on the
proposal the same day (DECISIONS 2026-10-29, about 12:50): all eight ids at the proposed tiers, the Denmark tree as drawn,
the Christian II moves in as its special, Sweden's nations go back to `['Sweden']`. READY A = the five Leopards, the
Christian II's move and the tree's Leopard line and special; READY B = the M41 DK-1, the Centurion Mk 5/2 DK and the
CV9035 DK with the recce/Centurion and CV90 branches.

## Current status

- Updated: 2026-10-29.
- Implementation: A built (leo1a3dk, leo1a5dk, leo1a5dk1, leo2a5dk, leo2a7dk), registered, tree and country wired; B in
  progress.
- Qualification: shaded blind photo critics and donor-distinctness critics owed until the 264 deploy frees the GPU.
- Publication: lane branch only; READY to "Claude of Tanks Main".

## What Denmark fielded (research)

| Vehicle | Danish service | Source |
|---|---|---|
| M24 Chaffee | 1953-62 (out by 1975), "neither life-extended nor upgraded" | Pansermuseet, M24 Chaffee page |
| Centurion Mk 3 / Mk 5 | 216 from 1953; 106 got the 105 mm L7A1 in 1964 (Mk 5/2); 90 got a laser rangefinder and night sights in 1985 (Mk 5/2 DK); retired 1993-95 | armyvehicles.dk centurion.htm; Pansermuseet Centurion page |
| M41 DK-1 | 53 from 1962; late-1980s DK-1 rebuild (Cummins VTA-903T, Jahn Anderson thermal with an Ericsson laser rangefinder, AAI APFSDS, Wegmann dischargers, Leopard-type skirts); out 1 January 2000 | armyvehicles.dk m41dk1.htm; Pansermuseet M41 page |
| Leopard 1A3 DK | 120 delivered 1976-78 (welded turret, periscope wipers, no close-defence plate, dozer channels) | armyvehicles.dk leopard1a3.htm; Pansermuseet Leopard 1 page |
| Leopard 1A5 DK | all 230 (with 110 ex-German A3/A4) converted 1990-94: EMES 18 thermal FCS, the welded turret kept | armyvehicles.dk leopard1a5.htm; Pansermuseet Leopard 1 page |
| Leopard 1A5 DK-1 | 35-36 for UNPROFOR/SFOR, 1994-95: air conditioning and a Honda generator on the turret rear, the M41 DK-1's searchlight, GPS; Operation Bøllebank, 29 April 1994 | armyvehicles.dk leopard1a5.htm; Pansermuseet; Wikipedia, Operation Bøllebank |
| Leopard 2A4 | 18 as the 1999-2000 "Experience Squadron", stock German tanks | Pansermuseet Leopard 2 page |
| Leopard 2A5 DK | 51 ex-German 2A4s converted under the 29 June 2000 contract; Helmand 2007-14 with bar armour from 2008 | armyvehicles.dk leopard2a5.htm, leopard2a5desert.htm |
| Leopard 2A7 DK | 44 for Jydske Dragonregiment, 2019-22 | Forsvaret Leopard 2A7 fact sheet; KMW press release |
| CV9035 DK | 45 from 2007 | armyvehicles.dk cv9035.htm |
| On order | CV90 MkIIIC: 115 (2024) + 44 (21 Nov 2025) = 159, replacing the CV9035 DK mid-life upgrade, fielded by 2030. No Danish Leopard 2A8 order exists (KNDS's 2A8 buyers to Sept 2026: DE, NO, NL, CZ, LT, SE) | EDR Magazine and euro-sd on the 2025 order; thedefensepost 2025-12-01 and 2026-09-22 |

Declined, with Main's agreement: the M24 (a stock US tank with no Danish kit, below the tier I floor), the 2A4
Experience Squadron (stock German 2A4s) and a 2A8.

## Ids, tiers and routes (Main's ruling)

| id | name | tier | route |
|---|---|---|---|
| leo1a3dk | Leopard 1A3 DK | I (tree root) | the Leopard 1A5's hull (`profiles/leopard1Hull.ts`) and a new welded 1A3 turret (`profiles/leopard1Dk.ts`) |
| leo1a5dk | Leopard 1A5 DK | I | the same, with EMES 18 |
| leo1a5dk1 | Leopard 1A5 DK-1 | I (twin build on leo1a5dk) | the same, with the DK-1 fit, UN white |
| m41dk1 | M41 DK-1 | II | a new photo-class build |
| centurion5_2dk | Centurion Mk 5/2 DK | III | the Centurion Mk 5/2 builder with the DK fit |
| cv9035dk | CV9035 DK | V | the CV90 family |
| leo2a5dk | Leopard 2A5 DK | IX | the source-study 2A5 (`profiles/leopardX.ts`, Danish kit option) and `profiles/leopard2Dk.ts` |
| leo2a7dk | Leopard 2A7 DK | X | the source-study 2A7V, the same way |

Tree: `src/techTree/nations/denmark.ts`, one root (leo1a3dk). Leopard line leo1a3dk -> leo1a5dk [+ leo1a5dk1] ->
leo2a5dk -> leo2a7dk; recce and Centurion leo1a3dk -> m41dk1 -> centurion5_2dk; CV90 centurion5_2dk -> cv9035dk; the
Christian II in the special lane. Denmark is the fleet's fifteenth team country (`src/sim/countries.ts`), filling first
from Sweden.

## Photographs (viewed, cited, not downloaded or committed)

- Krigsmuseet Leopard 1 side view, Wikimedia Commons `Leopard_1_kampvogn_ved_Krigsmuseet_01.jpg`: the welded turret's
  side profile, scaled by the 0.74 m road-wheel pitch (turret roof 0.87 m over its base, the front corner strip and brow,
  body and rear bin stations, the 2x4 discharger block, the rangefinder-port cover).
- Aalborg Forsvars- og Garnisonsmuseum 1A5 DK turret, Commons `Turret_Leopard_I_in_Aalborg_..._pic1.JPG` and `pic2`: the
  pointed plan front, the port bosses with white-ringed covers, EMES 18 at the front right, the raised PERI R12, the loader's
  hatch on the left.
- Leopard 1 A5 DK-1 with RAMTA plough (Vinding, CC BY-SA 3.0), Commons `Leopard_1_A5_DK-1.jpg`; Leopard 1 A5 DK1 62.448
  (Danish Air Show 2022), Commons; Danish Leopard 1A5 in Bosnia 1996, Commons.
- Danish Leopard 2A5s at Grafenwöhr, 3-4 July 2014 (US Army, public domain), Commons
  `Royal_Danish_Army_at_JMTC,_Grafenwoehr_140704-A-BS310-229.jpg` and `Danish_army_trains_..._140703-A-HE359-023.jpg`: the
  hull rear and quarter bar armour, the bustle cage, the drum commander's sight, the three-tone coat.
- Danish Leopard 2A7DK live fire in Latvia, Commons `Danish_Leopard_2A7DK_Live_fire_Latvia.jpg`: the Barracuda cover over
  hull, turret and gun; the Danish Army's Broshuis transporter photograph (Commons): the ribbed stowage modules.
- armyvehicles.dk `centurionmkv2dk.jpg` (Henrik Clausen): the Centurion Mk V/2 DK's mantlet box and roof sight box.

## Handedness note

A +Z hull's right is -X (turret-yaw-convention). The Danish Leopard 1s put the commander's cupola, the PERI R12 and the
EMES 18 on the right (-X) and the loader on the left (+X), as the Aalborg turret shows. The German leo1a5 builder draws its
EMES 18 and commander's cupola at +X, the tank's left, with comments calling it the right: reported to Main, not changed
here.
