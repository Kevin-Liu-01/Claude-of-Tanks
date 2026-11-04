# K30 Biho (`k30_biho`), run packet

## Current status

- IDs and display names: `k30_biho`, "K30 Biho" (`src/vehicles/tankLabels.ts`); fleet group `k30Biho`.
- Updated: 2026-11-03 (release 269, registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the fleet has no K200, so the ROK Army's BMP-3 hull and running gear (`profiles/afvFamily.ts`) stand in under a box turret with one 30 mm barrel on each side), which builder K replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action: builder K authors the measured build and keeps the spatial datums in the spec file (turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew) equal to the geometry; then the combat-anatomy
  update, marking seats, interior fill, presentation anchors, auxiliary inventory and tank assets for this id (generated
  tables the registrar did not write: the browser's lazy anatomy and marking-seat loaders reject an unknown group until
  they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder K after the registrar): `src/vehicles/k30BihoSpecs.ts`, `src/vehicles/profiles/k30Biho.ts` (and new files beside it: the K200-family hull in its own module, written so a K200 or K242 could use it later), this packet.
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

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; South Korea's BMP-3 and K21 line, off the BMP-3 (ROK) on lane 2 under the K21 |
| Class / role / status / era | spaa / scout (recon) / service / modern | |
| HP, engine, weight | 2,150 / 520 hp / 26.5 t | |
| Speed, reverse, traverse | 65 / 20 km/h / 46 and 70 deg/s authored | en.wikipedia |
| Gun arc | -10 / +85 degrees, 50 deg/s | ARMSNET |
| 30 mm | APDS-T 125/112/100 mm, 52 dmg, 1,120 m/s, 300 rounds; HEI-T (HE channel) 48 dmg, 1,080 m/s, 300 rounds; 0.30 s; sound `mk30-2` | the 2K22M Tunguska-M's 30 mm rows (the BMPT twin 2A42 package at tier V); the 600 rounds split evenly |
| Dimensions | hull and overall 6.77 m, width 3.00 m, height 4.05 m (radar up) | en.wikipedia |
| Fire axes | twin, x = +/-1.10 m; muzzles 2.60 m ahead of the trunnion (placeholder) | |
| Turret | box 1.90 x 0.85 x 2.40 m, 15/20 mm (on the stand-in hull) | placeholder |
| Crew | driver (hull), gunner, commander and radar operator (turret) | |
| Paint | spec coat and stock: `sig_k2`, the K2's ROK woodland (green, black and brown), the photographs' four-colour coat's closest | no new paint |
| Marking | hull left anchor, number "312" (photo 01) | |
| Wheels / track | South Korea's IFV rule (the K1A1 wheel the Korean IFV hulls draw; no exception); the compact IFV track (`trackPatterns.ts`) | |
| Audio | `diesel_ifv` | |
| View / camouflage | 440 m, 0.245 / 0.215 | |

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

## Construction work order (builder K)

- Replace the placeholder with the measured build on the base vehicle's own hull and running-gear builders (default-off
  options only, every sharing id byte-identical by digest); keep the spec's turret and gun pivots, fire axes
  (`gun.muzzles`), turret plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and fittings through the whole pitch range at every yaw (a clearance probe in the group's own
  selftest, as `profiles/chineseAirDefense.selftest.mjs`).
- Write the K200-family hull new (six road wheels, the K200A1 lengthened by one station) in its own module; the frame hook in `k30BihoSpecs.ts` then copies the stand-in hull's frame and must be replaced by the K200 hull's own records.
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
