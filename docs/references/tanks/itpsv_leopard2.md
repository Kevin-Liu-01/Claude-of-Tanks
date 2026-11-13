# ItPsv Leopard 2 (Leopard 2 Marksman) (`itpsv_leopard2`), run packet

## Current status

- IDs and display names: `itpsv_leopard2`, "ItPsv Leopard 2 (Leopard 2 Marksman)" (`src/vehicles/tankLabels.ts`); fleet group `marksman`.
- Updated: 2026-11-03 (release 269, builder M over the registrar R0's registration).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED PHOTOGRAPHIC BUILD (builder M). The Leopard 2A4's hull and running gear with the
  leo2a4's own options (`profiles/leopard2Hull.ts`, as `profiles/leopard2A4Family.ts` builds it) and the 2A4's hull kit
  (`profiles/leopard2A4Kit.ts` `addLeo2A4HullKit`, a new export, its German rear number off) under the one Marksman turret
  (`profiles/marksmanTurret.ts`, the turret's numbers in `marksman_t55.md`), every spatial datum the spec reads drawn from
  one frame (`profiles/marksmanFrame.ts`); the seven leopard2a4Family ids byte-identical.
- Qualification status: native fixture `src/vehicles/profiles/marksman.selftest.mjs` (both Marksmen, both qualities);
  photographic qualification (a dated packet under `docs/references/photos/`, registered in
  `tools/photo-reference-policy.mjs`) is owed and is the coordinator's: the as-built envelope is 9.31 m with the guns
  forward x 3.67 m (the skirts) x 3.93 m (the radar's top; whips out).
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action (coordinator): register `marksman.selftest.mjs`, then the generated tables for this id: combat
  anatomy (`npm run tank:anatomy:update` and `check`), marking seats, interior fill, presentation anchors, auxiliary
  inventory (the eight smoke tubes), tank assets; the photographic packet; a `nationalGunClearance.selftest.mjs` row for
  the curve below.

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder M after the registrar): `src/vehicles/marksmanSpecs.ts`, `src/vehicles/profiles/marksman.ts` (and new files beside it: one Marksman turret module carried by both hulls), this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

Finland's ItPsv Leopard 2 at the 2015 Independence Day equipment show (photos 07-08 the whole vehicle, 02-06 the turret,
radar and 35 mm): the Leopard 2A4 hull (seven road wheels, side skirts) carrying the Marconi Marksman turret, the ring
adapted to the Leopard 2's, in Finland's green, black and grey three-tone. The same turret as the T-55 Marksman. Filed under
the UK, the turret's maker.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 | en.wikipedia "Marksman anti-aircraft system" |
| Mass | 49 t | en.wikipedia |
| Length / width / height | 9.30 m guns forward / 3.70 m / 4.82 m | en.wikipedia |
| Guns | the Marksman turret's two 35 mm Oerlikon KDA, 460 + 40 rounds | en.wikipedia |
| Gun arc | -10 to +85 degrees | en.wikipedia (the turret's) |
| Engine | the Leopard 2's twin-turbo V12, 1,479 hp (1,103 kW) at 2,600 rpm | en.wikipedia |
| Speed / range | 72 km/h / 550 km | en.wikipedia |
| Production | seven, 2014-15; conversion from 2015, in service 2016 | en.wikipedia; the owner |

## Registration numbers (combat rows are final-intent; spatial datums are builder M's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion (the Leopard 2's mobility and protection); after the ItPsv 90 on the UK Marksman line, lane 5 |
| Class / role / status / era | spaa / scout (recon) / service / modern | in service 2016 |
| HP, engine, weight | 2,600 / 1,500 hp (the fleet's 2A4 MB 873; the page's 1,479 hp is the same engine) / 49 t | |
| Speed, reverse, traverse | 72 / 25 km/h (the 2A4's reverse) / 40 and 70 deg/s authored | en.wikipedia |
| Gun arc | -10 / +85 degrees, 50 deg/s; the 2A4's curve dropped for the guns' own stops over the engine deck (at most 0.4 degrees up, yaw 154-174): [[0, -10], [153, -10], [154, -9.7], [164, -9.6], [174, -9.6], [175, -10], [180, -10]] | the curve measured (builder M, round 5) |
| 35 mm | the ItPsv 90's rows: APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the same turret and guns |
| Dimensions | hull 7.72 m (the 2A4's), overall 9.30 m with the guns forward (the published 9.30 m, built 9.31 m: the frame's muzzles 5.145 m ahead of the hull's origin, the stern rack 4.165 m behind it), width 3.70 m (built 3.67 m over the skirts), height 3.93 m (the radar's top 2.29 m over the 1.64 m ring; the published 4.82 m is photo 08's antenna mast, not built) | en.wikipedia; as built |
| Fire axes | the ItPsv 90's: twin, x = +/-1.24 m, 0.50 m over the drums' axis (0.58 m over the ring and 0.16 m ahead of it), the bore mouths 4.615 m ahead of the axis; index 0 the right; the ring the Leopard 2's (0, 1.64, 0.37) | `profiles/marksmanFrame.ts` |
| Turret | the ItPsv 90's: the body's fourteen planar faces as plates, 35 mm walls and a 30 mm roof | `marksman_t55.md` |
| Paint | spec coat and stock: `paint_cv90_mkiv` (Swedish splinter woodland), the closest existing coat to Finland's three-tone (no Finnish Leopard 2A4 exists in the fleet) | no new paint |
| Marking | hull left anchor, "ItPsv" (no number shows in photos 07-08) | |
| Wheels / track | the Leopard 2A4's (`WHEEL_STANDARD_EXCEPTIONS`, donor leo2a4), its track by the same wheel | |
| Audio | `diesel_v12_modern` (the MB 873) | |
| View / camouflage | 450 m, 0.215 / 0.185 | |

## Build (builder M, 269)

The turret is the one Marksman module; its numbers and photographs are in `marksman_t55.md` (Build). This hull:
`buildLeopard2Hull` with the leo2a4's own options (the round-rod exhaust grilles, the early fore-skirt drop, the fuel
fillers, the forward lift eyes on the glacis at z 2.40; photos 07-08: seven road wheels, the side skirts, the glacis's
spare links) and the 2A4's hull kit (`addLeo2A4HullKit`, `rearNumber: false`: the German "Y-241" left off; no number
shows in photos 07-08). Its turret: the adapter `leopard2` (1.06 m over the race's 1.02 m), the pods in the dark weapon
finish (photos 02-08). Triangles (geometry receipt, HIGH): 29,070 (the leo2a4 37,791).

Round 4 (2026-11-04; a blind A/B judge preferred r2, c42fa5565d, over r3, b22cba2b36, in all 14 pairs: the lengthened turret
was the wrong call): back to r2's proportions, the body 3.07 m long (r3 3.82 m), r2's elevation axis (0.16 m ahead of the
ring) and pod tail, the 9.30 m from the barrels again (3.06 m showing past the pod; photos 02, 08: about 3 m); kept from
r3: the T-55's flexible skirts and smooth front mudguards, the ribbed black rubber boot (now under a drum housing, photo
04), the rod and clamp bands on each barrel, the open muzzle frame round two rings (now 0.30 m across, 2.2 times the
tube), the thicker barrels, the smaller radar (its dish's top 0.82 m and the arm's 0.99 m over the roof, about 0.8 of the
turret's height), the smaller sight heads. Fixed on r2: the body 0.24 m wider (height to width 0.63; photos 03, 10: about
0.60); the front hard, an overhanging upper plate to a sharp horizontal crease over a deep V lower front (07, 09, 10);
the pod noses pointed and faceted and 0.38 m further forward, standing 0.3-0.6 m proud of the receding lower front with
the guns level, the bore in the pod's upper quarter (02, 07, 09, 10). Photo 08's A-frame antenna stays unbuilt (no other
photograph shows it).

Round 5 (2026-11-04; the blind A/B judge preferred r4, 0292fcf582, over r2 in all 14 pairs; worktree
`~/cot-lanes/aa269-mk`): the gun housings 0.22 m shallower, their underside on the drums' axis so half of each drum shows
under them (photos 02, 08: the drum about 1.25 times the housing's depth), the bore 0.12 m higher to enter 19 % under the
housing's top, the pointed nose kept; the radar's pleated boot 0.46 m across (0.9 of the dish; it was 1.45), its drum
housing and column slimmer; the sight heads 0.31 m tall, two thirds of the boot's width (02, 07); a brow block jutting
0.20 m at the top front of the body (07); on the T-55, seven thin hanging flaps a side on a hem strip, seams between
them, 3-5 cm of flare and their feet 0.50-0.54 m over the ground (about 60 % of each road wheel showing, photo 01), the
front mudguards bare sheet metal (the drape over them dropped). Kept: the chin, the tapered nose, the muzzle frames, the
barrel rods and the skirts' presence; photo 08's tripod stays out.

Receipts after round 5 (2026-11-04, worktree `~/cot-lanes/aa269-mk`, uncommitted over d24e227023): the fixture
`src/vehicles/profiles/marksman.selftest.mjs` PASS (both ids, both qualities: the frame's fourteen faces planar, convex and
closed; the rings, axis, bores and muzzle plane; the envelope; the guns 24 mm from the turret's stock through -10 to +85
degrees, the hubs excepted; 47 mm (ItPsv 90) and 27 mm (ItPsv Leopard 2) from the hull at every 5 degrees of yaw and pitch
from the published stops, re-measured per degree at the sweep's 26 mm with `~/cot-lanes/twin-aa-269-evidence/M/scripts/hullfloors-mk.mjs`
and fitted by `tools/gun-depression-sweep.mjs --envelope`: the ItPsv 90 keeps the full -10 degrees all round, the ItPsv
Leopard 2 rises at most 0.4 degrees at yaw 154-174); the accessory contact probe 0 floating / 0 clipping;
`tools/roof-pocket-census.mjs` none; `tools/gun-junction-census.mjs` CLOSED at rest, +85 and -10;
`tools/vehicle-controls-inventory.mjs --check --ids=marksman_t55,itpsv_leopard2` past its smoke-direction check (it stops on
`auxiliaryInventory.generated.ts`, which holds no Marksman rows on this branch yet: the coordinator's regeneration);
`internalPlacement.selftest.mjs` clean on both ids (the fleet run still fails on lvkv9040's own module overlaps); recoilRig and type59Overhaul PASS; the geometry digest of t55a, type59 and the
seven leopard2a4Family ids byte-identical to the first round's baseline
(`~/cot-lanes/twin-aa-269-evidence/M/digest-{before,r5}.json`); `npm run -s typecheck` clean (TypeScript 7, no unused
symbols, oxlint).
Renders: `~/cot-lanes/twin-aa-269-evidence/M/r1/` (first build), `r2/` (c42fa5565d), `r3/` (b22cba2b36), `r4/` (0292fcf582)
and `r5/` (round 5).



## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/marksman/` (comparison only; never shipped). This id is photos 02-08 (07-08 the whole vehicle); 01 and 09-10 show the same turret on other hulls.

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [Marksman SPAAG.jpg](https://commons.wikimedia.org/wiki/File:Marksman_SPAAG.jpg) | MoRsE | CC BY-SA 3.0 | 2008-06-03 |
| 02 | [Kalustoesittely itsenäisyyspäivä 2015 19 Leopard 2 Marksman turret.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_19_Leopard_2_Marksman_turret.JPG) | MKFI | Public domain | 2015-12-06 |
| 03 | [Kalustoesittely itsenäisyyspäivä 2015 20 Leopard 2 Marksman turret.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_20_Leopard_2_Marksman_turret.JPG) | MKFI | Public domain | 2015-12-06 |
| 04 | [Kalustoesittely itsenäisyyspäivä 2015 22 Leopard 2 Marksman radar.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_22_Leopard_2_Marksman_radar.JPG) | MKFI | Public domain | 2015-12-06 |
| 05 | [Kalustoesittely itsenäisyyspäivä 2015 23 Leopard 2 Marksman Oerlikon 35 mm.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_23_Leopard_2_Marksman_Oerlikon_35_mm.JPG) | MKFI | Public domain | 2015-12-06 |
| 06 | [Kalustoesittely itsenäisyyspäivä 2015 24 Leopard 2 Marksman Oerlikon 35 mm.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_24_Leopard_2_Marksman_Oerlikon_35_mm.JPG) | MKFI | Public domain | 2015-12-06 |
| 07 | [Kalustoesittely itsenäisyyspäivä 2015 12 Leopard 2 Marksman.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_12_Leopard_2_Marksman.JPG) | MKFI | Public domain | 2015-12-06 |
| 08 | [Kalustoesittely itsenäisyyspäivä 2015 13 Leopard 2 Marksman.JPG](https://commons.wikimedia.org/wiki/File:Kalustoesittely_itsen%C3%A4isyysp%C3%A4iv%C3%A4_2015_13_Leopard_2_Marksman.JPG) | MKFI | Public domain | 2015-12-06 |
| 09 | [Markoni Marksman ‘03 EB 10’ (51294781146).jpg](https://commons.wikimedia.org/wiki/File:Markoni_Marksman_%E2%80%9803_EB_10%E2%80%99_(51294781146).jpg) | Alan Wilson from Peterborough, Cambs, UK | CC BY-SA 2.0 | 2021-05-23 |
| 10 | [Marksman Anti-Aircraft System (50497475972).jpg](https://commons.wikimedia.org/wiki/File:Marksman_Anti-Aircraft_System_(50497475972).jpg) | Airwolfhound from Hertfordshire, UK | CC BY-SA 2.0 | 2020-10-10 |

## Remaining work (coordinator)

- Register `src/vehicles/profiles/marksman.selftest.mjs` in `npm test`.
- The generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats, interior
  fill, presentation anchors, auxiliary inventory, tank assets; a `nationalGunClearance.selftest.mjs` row; the
  photographic packet registration.
- Not built: photo 08's flat antenna on a tripod mast over the roof (the 4.82 m); the Finnish roundels (no `fi` painter).
