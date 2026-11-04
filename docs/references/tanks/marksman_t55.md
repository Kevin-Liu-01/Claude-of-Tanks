# Marksman (T-55): the Finnish ItPsv 90 (`marksman_t55`), run packet

## Current status

- IDs and display names: `marksman_t55`, "Marksman (T-55)" (`src/vehicles/tankLabels.ts`); fleet group `marksman`.
- Updated: 2026-11-03 (release 269, registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the fleet's T-55A hull and running gear (`profiles/t54Family.ts`, its real chassis) under the one box Marksman turret with a 35 mm barrel on each side), which builder M replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action: builder M authors the measured build and keeps the spatial datums in the spec file (turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew) equal to the geometry; then the combat-anatomy
  update, marking seats, interior fill, presentation anchors, auxiliary inventory and tank assets for this id (generated
  tables the registrar did not write: the browser's lazy anatomy and marking-seat loaders reject an unknown group until
  they exist).

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

Finland's ItPsv 90 (photo 01, Helsinki, "Ps465-22"): a T-55 hull (five road wheels, the T-55's deck, the long rear fuel
drums) under the Marconi Marksman turret, a wide faceted turret with the two 35 mm Oerlikon KDA in armoured side pods
(long barrels, slotted muzzle brakes), the tracking and search radar on a short mast with its dish at the roof rear-left,
the commander's sight; Finland's three-tone (green, black and grey). Photos 02-08 show the same turret on Finland's
Leopard 2 (the turret's detail), 09-10 the UK's Chieftain Marksman. Filed under the UK, the turret's maker; the game has no
Finland tree.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (driver, gunner, commander) + back-up crew | en.wikipedia "Marksman anti-aircraft system" |
| Mass | 41 t (the T-55AM 36 t) | en.wikipedia |
| Guns | two 35 mm Oerlikon KDA, 18 rounds a second together; 460 fragmentation + 40 anti-tank rounds (the infobox's 440 is not used) | en.wikipedia |
| Muzzle velocity / range | 1,175 m/s / 4,000 m | en.wikipedia |
| Gun arc | -10 to +85 degrees, 360 degrees | en.wikipedia |
| Radar | Marconi 400 series X/J band, 12 km search, 10 km track; laser rangefinder 8 km | en.wikipedia |
| Protection | the turret proof against 14.5 mm and 155 mm air bursts | en.wikipedia |
| Engine | V-55 V12 diesel, 620 hp | en.wikipedia |
| Smoke | eight Wegmann 76 mm dischargers | en.wikipedia |
| Service | seven ordered by Finland in 1990, in service 1990, to war-time storage 2010 | en.wikipedia |
| Dimensions | not published for the T-55 version | |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; the UK tree's new Marksman line (the T-55 first), off the Chieftain Mk 10 (the Marksman was trialled on the Chieftain) on lane 5 |
| Class / role / status / era | spaa / scout (recon) / service / modern | in service 1990, as the 2K22M of 268 |
| HP, engine, weight | 2,400 / 620 hp / 41 t | |
| Speed, reverse, traverse | 50 / 12 km/h (the T-55A's reverse) / 36 and 70 deg/s authored | the T-55's 50 km/h |
| Gun arc | -10 / +85 degrees, 50 deg/s; the T-55A's traverse curve dropped | en.wikipedia |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 460 rounds; 0.35 s | the Gepard 1A2's KDA rows, the same gun |
| Dimensions | hull 6.04 m (the T-55A's), overall 7.8 m (estimate: the placeholder's muzzles 4.76 m ahead of the hull centre), width 3.27 m, height 4.35 m (estimate: the Leopard version's 4.82 m less the T-55's 0.47 m lower ring) | |
| Fire axes | twin, x = +/-1.40 m; muzzles 4.20 m ahead of a trunnion 0.60 m ahead of the ring (placeholder, shared with the ItPsv Leopard 2) | |
| Turret | box 2.40 x 1.01 x 2.80 m, 35/40 mm | placeholder |
| Paint | spec coat and stock: `paint_cv90_mkiv`, the CV90 Mk IV's Swedish splinter woodland (green, black and a grey-green), the closest existing coat to Finland's three-tone | no new paint |
| Marking | hull left anchor, number "465-22" (photo 01, "Ps465-22") | |
| Wheels / track | the T-55A's (the period starfish while `T54_STARFISH_WHEELS` holds), its track by the same wheel | |
| Audio | `diesel_v12_soviet` (the V-55) | |
| View / camouflage | 445 m, 0.225 / 0.195 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/marksman/` (comparison only; never shipped). This id is photo 01; 02-10 are the turret's detail.

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

## Construction work order (builder M)

- Replace the placeholder with the measured build on the base vehicle's own hull and running-gear builders (default-off
  options only, every sharing id byte-identical by digest); keep the spec's turret and gun pivots, fire axes
  (`gun.muzzles`), turret plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and fittings through the whole pitch range at every yaw (a clearance probe in the group's own
  selftest, as `profiles/chineseAirDefense.selftest.mjs`).
- Build the Marksman turret once, as its own module, and seat it on each hull's ring (the T-55's and the Leopard 2A4's).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
