# Flakpanzer Gepard 1A2 (`gepard_1a2`), run packet

## Current status

- IDs and display names: `gepard_1a2`, "Flakpanzer Gepard 1A2" (`src/vehicles/tankLabels.ts`); fleet group `gepard`.
- Updated: 2026-11-02 (release 268, registrar R0).
- Owner request: "love your work on the terminnators. that made me realize we should add more double barrel vehicels"
  (2026-11-02); the coordinator settled five new playable ids, nothing existing changes.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the shared Leopard 1 hull and running gear (`profiles/leopard1Hull.ts`, its real chassis) under a box turret with one 35 mm barrel on each side), which builder G replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-268`, branch `item/twin-aa-268` (from origin/main
  7cc204ab32), uncommitted.
- Current next action: builder G authors the measured build in `src/vehicles/profiles/gepard.ts` and keeps the spatial datums in
  `src/vehicles/gepardSpecs.ts` (turret and gun pivots, fire axes, launcher mouths, turret plates, turret-local modules and crew) equal to
  the geometry; then the combat-anatomy update, marking seats, interior fill, presentation anchors, auxiliary inventory
  and tank assets for this id (generated tables the registrar did not write: the browser's lazy anatomy and marking-seat
  loaders reject an unknown group until they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 268 twin-cannon air-defence round.
- Owned files (builder G after the registrar): `src/vehicles/gepardSpecs.ts`, `src/vehicles/profiles/gepard.ts`, this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration,
  procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, markings anchors,
  roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, audio engine family, the tech
  tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the coordinator's baseline).

## Configuration

The Gepard 1A2 in Bundeswehr NATO three-tone: Panzermuseum Munster (03-11; 05 is the B2L data plate), the
B2L (12, number 422 on the turret), Brussels (13) and Brasschaat (14); 01-02 show the covered guns and radar. Leopard 1
hull, the turret with the folding search radar at the rear and the tracking radar at the front, a 35 mm KDA on each
side outboard of the turret (03, 04 and 07: the muzzle brakes and the velocity-measuring heads).

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (driver, gunner, commander) | de.wikipedia "Flugabwehrkanonenpanzer Gepard" |
| Combat weight | ~47.5 t (15.5 t turret, 32 t chassis) | de.wikipedia |
| Length | 7.68 m overall (7.76 m in the 1A2 section) | de.wikipedia |
| Width | 3.27 m (3.28 m in the 1A2 section; en.wikipedia: 3.71 m) | de.wikipedia; en.wikipedia |
| Height | 3.29 m search radar folded, 4.22 m raised (the brief's 4.03 m is not supported) | de.wikipedia |
| Guns | two 35 mm Oerlikon KDA L/90, 550 rpm each; 320 AA + 20 AP rounds a gun (640 + 40) | de.wikipedia; en.wikipedia |
| Gun arc | -10 to +85 degrees | de.wikipedia |
| Engine | MTU MB 838 CaM-500, 610 kW (830 PS), ~65 km/h, 550 km | de.wikipedia; en.wikipedia |
| 1A2 | the 1996-2000 service-life extension (NDV): 147 Bundeswehr vehicles, 60 Dutch; FAPDS ammunition | de.wikipedia; en.wikipedia |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | V | coordinator's suggestion; Germany's Leopard 1 row after the MBT-70 (lane 5): a direct child of the Leopard 1A5 at V would run its connector through the MBT-70, and lanes 4 and 8 cross the Lynx's and the A4 V's connectors |
| Class / role / status / era | spaa / scout (recon) / service / modern | the 1A2 is a 1996-2000 upgrade |
| HP, engine, weight | 2,500 / 830 hp / 47.5 t | |
| Speed, reverse, traverse | 65 / 25 km/h / 38 and 72 deg/s authored (42.6 and 79.2 after recon) | de.wikipedia; the Leopard 1A5's reverse |
| Gun arc | -10 / +85 degrees, 50 deg/s; the Leopard 1A5's traverse curve dropped (the guns ride outside the deck edge) | de.wikipedia |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; FAPDS-T (HE channel) 56 dmg, 1,440 m/s, 640 rounds; 0.35 s | the Terminator 2's 30 mm rows scaled by calibre (x 35/30); the published 40 + 640 load |
| SAM | none | the 1A2 carries no missiles |
| Fire control | 0.25 accuracy, 1.05 s aim (0.99 after recon) | |
| Fire axes | twin, x = +/-1.40 m (placeholder) | |
| Turret pivot | (0, 1.60, 0.50): the Leopard 1 hull's turret station on the 1.58 m deck | profiles/leopard1Hull.ts |
| Paint | spec coat: the Leopard 1A5's Bundeswehr NATO three-tone; stock: Germany's Factory coat `service_leo2a6m` (as the 1A5) | no new paint |
| Marking | turret left anchor (the Leopard 1A5's), Bundeswehr cross, number 422 (photo 12) | |
| Wheels | the Leopard 1A5's standard (`WHEEL_STANDARD_EXCEPTIONS`, donor leo2a4), not Germany's IFV Lynx wheel | |
| View / camouflage | 450 m, 0.225 / 0.195 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-268-evidence/photos/gepard/` (comparison only; never shipped).

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [Flakpanzer Gepard SPAAG.JPG](https://commons.wikimedia.org/wiki/File:Flakpanzer_Gepard_SPAAG.JPG) | Alf van Beem | CC0 | 2010-05-05 |
| 02 | [Flakpanzer Gepard (9394460358).jpg](https://commons.wikimedia.org/wiki/File:Flakpanzer_Gepard_(9394460358).jpg) | Stéphane Gaudry from Olne | CC BY 2.0 | 2013-07-28 |
| 03 | [Panzermuseum Munster 2010 0843.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0843.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 04 | [Panzermuseum Munster 2010 0844.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0844.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 05 | [Panzermuseum Munster 2010 0850.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0850.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 06 | [Panzermuseum Munster 2010 0851.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0851.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 07 | [Panzermuseum Munster 2010 0856.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0856.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 08 | [Panzermuseum Munster 2010 0857.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0857.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 09 | [Panzermuseum Munster 2010 0859.JPG](https://commons.wikimedia.org/wiki/File:Panzermuseum_Munster_2010_0859.JPG) | Banznerfahrer | CC BY-SA 3.0 | 2010-07-07 |
| 10 | [Munster 2022 - Panzermuseum - Flakpanzer Gepard - by-RaBoe 088.jpg](https://commons.wikimedia.org/wiki/File:Munster_2022_-_Panzermuseum_-_Flakpanzer_Gepard_-_by-RaBoe_088.jpg) | Raboe001 | CC BY-SA 3.0 | 2022-11-17 |
| 11 | [Munster 2022 - Panzermuseum - Flakpanzer Gepard - by-RaBoe 091.jpg](https://commons.wikimedia.org/wiki/File:Munster_2022_-_Panzermuseum_-_Flakpanzer_Gepard_-_by-RaBoe_091.jpg) | Raboe001 | CC BY-SA 3.0 | 2022-11-17 |
| 12 | [Flugabwehrpanzer Gepard B2L (51438431466).jpg](https://commons.wikimedia.org/wiki/File:Flugabwehrpanzer_Gepard_B2L_(51438431466).jpg) | Thomas Vogt from Paderborn | CC BY 2.0 | 2021-07-31 |
| 13 | [Bruxelles Musée Royal de l'Armée Panzer 01.jpg](https://commons.wikimedia.org/wiki/File:Bruxelles_Mus%C3%A9e_Royal_de_l%27Arm%C3%A9e_Panzer_01.jpg) | Zairon | CC BY-SA 4.0 | 2018-12-30 |
| 14 | [Flakpanzer Gepard Barbarian, Gunfire Artilleriemuseum Brasschaat foto 1.jpg](https://commons.wikimedia.org/wiki/File:Flakpanzer_Gepard_Barbarian,_Gunfire_Artilleriemuseum_Brasschaat_foto_1.jpg) | Alf van Beem | Public domain | 2017-04-22 |

## Construction work order (builder G)

- Replace the placeholder in `src/vehicles/profiles/gepard.ts` with the measured build; keep `src/vehicles/gepardSpecs.ts`'s turret and gun pivots,
  fire axes (`gun.muzzles`), launcher mouths (`gun.launcherMuzzles`, one per drawn tube, `launcherTubes` equal), turret
  plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and launchers through the whole pitch range at every yaw (`tools/gun-depression-sweep.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
