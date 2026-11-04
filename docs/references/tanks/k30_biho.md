# K30 Biho (`k30_biho`), run packet

## Current status

- IDs and display names: `k30_biho`, "K30 Biho" (`src/vehicles/tankLabels.ts`); fleet group `k30Biho`.
- Updated: 2026-11-03 (release 269, builder K after the registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: MEASURED BUILD. The K30 Biho on a new, reusable K200-family hull (`profiles/k200HullLayout.ts`,
  the data; `profiles/k200Hull.ts`, the builder; the K200A1 at five stations, the K30 at six), the turret and guns in
  `profiles/k30Biho.ts` on `profiles/k30BihoLayout.ts`; the spec's hull frame (plates, modules, driver, track) is the
  K200 hull's (`synchronizeK30BihoFrame` copies it from the layout, no longer from the BMP-3 (ROK) stand-in).
- Qualification status: NOT RUN (photographic packet). Builder K's own checks: see "Builder K receipts" below.
  Photographic qualification (a dated packet under `docs/references/photos/`, registered in
  `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed: the as-built envelope is 3.04 x 4.05 x 6.60 m.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269`, uncommitted.
- Current next action: the coordinator's changed-only regeneration for this id (combat anatomy, marking seats, interior
  fill, presentation anchors, auxiliary inventory, tank assets), then the photographic packet.

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder K after the registrar): `src/vehicles/k30BihoSpecs.ts`, `src/vehicles/profiles/k30Biho.ts`,
  `src/vehicles/profiles/k30BihoLayout.ts`, `src/vehicles/profiles/k30Biho.selftest.mjs`, the K200-family hull
  (`src/vehicles/profiles/k200HullLayout.ts`, `src/vehicles/profiles/k200Hull.ts`: `k200HullLayout(5)` is the
  K200A1 for a later K200 or K242, `K30_HULL` the K30's), this packet. The hull reuses the fleet's running gear
  (`KIT.buildRunningGear`) and the PGZ chassis' `convexBody` unchanged.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

The ROK Army's K30 Biho: the K200A1 aluminium APC hull lengthened by one road-wheel station (six road wheels), its sloped
bow and trim vane, the rear ramp; the turret with the two 30 mm KCB cannons in mounts on its sides, the TPS-830K search
radar on a mast over the turret, the EO tracking sensor, crew hatches; the ROK four-colour woodland. Photo 01 is the front
("312"), 02-03 the front quarter, 04/07 the side, 05 firing, 06/08 groups.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 4 | en.wikipedia "K30 Biho" |
| Mass | 26.5 t | en.wikipedia |
| Length / width / height | 6.77 m / 3.0 m (the brief's 3.30 m is not on the page) / 4.05 m (the brief's 4.07 m) | en.wikipedia |
| Guns | two SNT Dynamics KCB 30 x 170 mm, 600 rpm, 300 rounds a gun | en.wikipedia |
| Gun arc | -10 to +85 degrees (sources disagree on the top: +70 or +85) | ARMSNET; a War Thunder forum post |
| Radar / EO | TPS-830K X-band pulse-Doppler, 17 km on a 2 m2 target; EOTS, FLIR and laser rangefinder past 10 km | en.wikipedia |
| Engine | MAN-Doosan D2840L, 520 hp | en.wikipedia |
| Speed / range | 65 km/h (the brief's 60) / 500 km | en.wikipedia |
| Production | 176; in service from 1999 | en.wikipedia |

## Registration numbers (the registrar's combat rows, kept)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; South Korea's BMP-3 and K21 line, off the BMP-3 (ROK) on lane 2 under the K21 |
| Class / role / status / era | spaa / scout (recon) / service / modern | |
| HP, engine, weight | 2,150 / 520 hp / 26.5 t | |
| Speed, reverse, traverse | 65 / 20 km/h / 46 and 70 deg/s authored | en.wikipedia |
| Gun arc | -10 / +85 degrees, 50 deg/s | ARMSNET |
| 30 mm | APDS-T 125/112/100 mm, 52 dmg, 1,120 m/s, 300 rounds; HEI-T (HE channel) 48 dmg, 1,080 m/s, 300 rounds; 0.30 s; sound `mk30-2` | the 2K22M Tunguska-M's 30 mm rows (the BMPT twin 2A42 package at tier V); the 600 rounds split evenly |
| Hull armour | glacis 33 mm (KE/CE 70), lower 26 (56), sides 17 (36), rear 16 (32), roof 6 (12) | the BMP-3 (ROK)'s balanced values the stand-in carried, kept for the K200A1's spaced steel on aluminium (12.7 mm AP proof) |
| Turret armour | 15 mm (KE 15, CE 20) | the registrar's |
| Paint | spec coat and stock: `sig_k2`, the K2's ROK woodland (green, black and brown) | no new paint |
| Marking | hull left anchor, number "312" (photo 01) | |
| Wheels / track | South Korea's IFV rule (the K1A1 wheel); the compact IFV track (`trackPatterns.ts`) | registrar |
| Audio | `diesel_ifv` | |

## Measured numbers (builder K)

Scale: photograph 07 (a square telephoto side view of the left flank) at 4.07 mm a pixel, from the track's 152 mm
pitch (37.4 px, autocorrelated over the lower run). Cross-checks: the road wheels 0.63 m over the tyres (published
610 mm), the roof 1.85 m (the K200's published "hull top, front" 1.83 m), the raised antenna's top 4.05 m (published).
A soldier on the roof reads short at this scale (about 1.6 m, stepping up); the published 6.77 m length would need
4.28 mm a pixel, which makes the wheels 0.66 m and the turret 4.2 m tall with the radar up, so the build keeps 4.07.

| Datum | Value | From |
| --- | --- | --- |
| Hull (trim vane's face to rear plate) | 6.43 m = the K200A1's 5.49 m + one 0.94 m station bay | photo 07, x 65 to 1645 |
| Overall length | 6.60 m (tail-light guards, tow eyes); published 6.77 m: CONFLICT, 3 % short | photo 07 |
| Width | 2.96 m over the sponsons, 3.00 m over the skirts (published 3.0 m) | published |
| Roof / sponson underside / skirt bottom / belly | 1.85 / 1.16 / 0.835 / 0.41 m | photo 07; belly the published clearance |
| Glacis | 1.12 m long, 23 degrees, the nose at 1.40 m; lower plate raked 31 degrees | photo 07 |
| Road wheels (behind the bow) | 1.351, 2.039, 2.946, 3.724, 4.481, 5.262 m; 0.62 m dual, no return rollers | photo 07 hubs |
| Sprocket / idler | 0.602 m (front, r 0.27 at 0.67 m) / 5.991 m (rear, r 0.25 at 0.60 m) | photo 07 |
| Track | 0.38 m (published 381 mm), lane 1.26 m off the centreline | published |
| Turret ring | 1.20 m aft of the hull's middle, at the roof | photo 07, the turret body's middle |
| Turret | 2.89 m long (front body to rear face; 3.45 m with the basket), roof 1.09 m over the ring (2.94 m) | photo 07 |
| Central front body / rear body | 1.28 m wide / 1.90 m at the shoulder over a 1.40 m set-in base | photo 01 ratios (405 x 215 px) |
| Gun housings | 1.09 m long, 0.80 m tall, 0.285 m wide, elevating with the guns (photo 02) | photos 07, 01 |
| Bores | 0.60 m over the ring (2.45 m over the ground), 1.51 m apart (photo 01: 1.46 m), muzzles 2.70 m ahead of the trunnion | photos 07, 01 |
| TPS-830K antenna | 1.50 x 0.54 m reflector, IFF box at 4.05 m | photos 01, 08; published height |
| EOTS head | 0.42 m wide on the front deck, window sloped 39 degrees | photos 01, 04 |

## Builder K receipts (2026-11-03)

`src/vehicles/profiles/k30Biho.selftest.mjs` holds the layout, the datums, the bores, the envelope, the guns' clearance to
the turret (2 cm) and the hull (2.5 cm, every 5 degrees of yaw and pitch) and the turret's to the hull. Evidence (renders,
logs, comparison sheets) in `~/cot-lanes/twin-aa-269-evidence/K/`.

| Check | Result |
| --- | --- |
| `k30Biho.selftest.mjs` | PASS: envelope 3.04 x 4.05 x 6.60 m; guns to turret 0.025 m; turret to hull >= 0.08 m at every 5 degrees of yaw; guns to hull 0.050 m over yaw 0-180 and -10 to +85 degrees (worst yaw 0, +75: the housings' rear arc over the roof) |
| Contact probe (`.qa-dev/contactprobe.mjs`) | PASS: 0 floating, 0 clipping |
| Roof pockets (`tools/roof-pocket-census.mjs`) | PASS: none |
| Gun line (`tools/gun-junction-census.mjs`) | PASS: CLOSED, 2 mouths, 3 poses |
| Internal placement (`internalPlacement.selftest.mjs` checks on this id) | PASS: 4 sided stations, no ring crossings, volumes inside the armour, no overlaps (the fleet run fails only on `marksman_t55` and `itpsv_leopard2`, builder M's) |
| Selftests naming the id | PASS: vehicleFacets, afvBalance, camoCatalogProductionIndices, vehicleAudioProfiles, ammunitionFlow, nationWheelSets, recoilRig |
| Geometry digest (`.qa-dev/geodigest2.mjs`) | only `k30_biho` moved (24,507 to 19,252 triangles); `bmp3_rok`, `bmp3`, `pgz95`, `pgz09`, `k21`, `k1a1`, `k1e1`, `k2_black_panther`, `k2b` byte-identical to the registrar's after-digest |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/k30/` (comparison only; never shipped). Name the numbers you take from where (K200A1 drawings and figures for the new hull).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [2007 Seoul Air Show 070.JPG](https://commons.wikimedia.org/wiki/File:2007_Seoul_Air_Show_070.JPG) | Rheo1905 | CC BY-SA 3.0 | 2007-10-20 |
| 02 | [2014 대한민국 방위산업전(DX Korea) 육군의 명품 무기와 장비 소개 (14960330913) (cropped).jpg](https://commons.wikimedia.org/wiki/File:2014_%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD_%EB%B0%A9%EC%9C%84%EC%82%B0%EC%97%85%EC%A0%84(DX_Korea)_%EC%9C%A1%EA%B5%B0%EC%9D%98_%EB%AA%85%ED%92%88_%EB%AC%B4%EA%B8%B0%EC%99%80_%EC%9E%A5%EB%B9%84_%EC%86%8C%EA%B0%9C_(14960330913)_(cropped).jpg) | 대한민국 국군 Republic of Korea Armed Forces | CC BY-SA 2.0 | 2014-09-26 |
| 03 | [2014 대한민국 방위산업전(DX Korea) 육군의 명품 무기와 장비 소개 (14960330913).jpg](https://commons.wikimedia.org/wiki/File:2014_%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD_%EB%B0%A9%EC%9C%84%EC%82%B0%EC%97%85%EC%A0%84(DX_Korea)_%EC%9C%A1%EA%B5%B0%EC%9D%98_%EB%AA%85%ED%92%88_%EB%AC%B4%EA%B8%B0%EC%99%80_%EC%9E%A5%EB%B9%84_%EC%86%8C%EA%B0%9C_(14960330913).jpg) | 대한민국 국군 Republic of Korea Armed Forces | CC BY-SA 2.0 | 2014-09-26 |
| 04 | [US Army photo 160803-A-VV548-006 Standing Watch together (cropped).jpg](https://commons.wikimedia.org/wiki/File:US_Army_photo_160803-A-VV548-006_Standing_Watch_together_(cropped).jpg) | U.S. Army photo by Sgt. Christopher Dennis, 1st Armored Brigade Combat Team Public Affairs, 1st Cav. Div. | Public domain | 3 August 2016 |
| 05 | [2011.5.3 육군방공학교 비호사격 (7633942120).jpg](https://commons.wikimedia.org/wiki/File:2011.5.3_%EC%9C%A1%EA%B5%B0%EB%B0%A9%EA%B3%B5%ED%95%99%EA%B5%90_%EB%B9%84%ED%98%B8%EC%82%AC%EA%B2%A9_(7633942120).jpg) | 대한민국 국군 Republic of Korea Armed Forces | CC BY-SA 2.0 | 2011-05-03 |
| 06 | [2014.5.15 육군 11사단 방공대대 비호사격훈련 Republic of Korea Army 11th Division (14008622537).jpg](https://commons.wikimedia.org/wiki/File:2014.5.15_%EC%9C%A1%EA%B5%B0_11%EC%82%AC%EB%8B%A8_%EB%B0%A9%EA%B3%B5%EB%8C%80%EB%8C%80_%EB%B9%84%ED%98%B8%EC%82%AC%EA%B2%A9%ED%9B%88%EB%A0%A8_Republic_of_Korea_Army_11th_Division_(14008622537).jpg) | 대한민국 국군 Republic of Korea Armed Forces | CC BY-SA 2.0 | 2014-05-15 |
| 07 | [Stinger Live Fire conducted at Daecheon Range for Freedom Shield 2026 260319-A-QD713-1241.jpg](https://commons.wikimedia.org/wiki/File:Stinger_Live_Fire_conducted_at_Daecheon_Range_for_Freedom_Shield_2026_260319-A-QD713-1241.jpg) | Spc. Jakaiyah Rumedon | Public domain | 2026-03-18 |
| 08 | [2013.10.1 건군 제65주년 국군의 날 행사 The celebration ceremony for the 65th Anniversary of ROK Armed Forces (10078326986).jpg](https://commons.wikimedia.org/wiki/File:2013.10.1_%EA%B1%B4%EA%B5%B0_%EC%A0%9C65%EC%A3%BC%EB%85%84_%EA%B5%AD%EA%B5%B0%EC%9D%98_%EB%82%A0_%ED%96%89%EC%82%AC_The_celebration_ceremony_for_the_65th_Anniversary_of_ROK_Armed_Forces_(10078326986).jpg) | 대한민국 국군 Republic of Korea Armed Forces | CC BY-SA 2.0 | 2013-09-17 |

## Construction work order (remaining)

- Generated tables for this id (coordinator, changed-only regeneration): combat anatomy (`npm run tank:anatomy:update`
  and `check`), marking seats, interior fill, presentation anchors, auxiliary inventory, tank assets; then the
  photographic packet registration.
- Photographs that would settle the open numbers: a square front view (the turret's and the antenna's widths), a top
  view (the turret's plan and the roof hatches), a rear view (the ramp and the rear stowage, the published length).
