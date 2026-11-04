# PZA Loara (`pza_loara`), run packet

## Current status

- IDs and display names: `pza_loara`, "PZA Loara" (`src/vehicles/tankLabels.ts`); fleet group `loara`.
- Updated: 2026-11-03 (release 269, registrar R0).
- Owner request: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)" (2026-11-03, with photographs of the Type 87, the Finnish T-55 Marksman, the Lvkv 9040 and the Loara), then the Leopard 2 Marksman ("produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"); the coordinator settled six new playable ids, nothing existing changes, each built on its real
  base vehicle by composing on the fleet relative's own builders.
- Implementation status: REGISTERED WITH A PLACEHOLDER BUILD. Every shared table carries the id; the build is the
  registrar's placeholder (the fleet's PT-91 Twardy hull and running gear (`profiles/pt91Twardy.ts`, its real chassis) under a box turret with one 35 mm barrel on each side), which builder P replaces with measured geometry in the group files.
- Qualification status: NOT RUN (placeholder geometry). Photographic qualification (a dated packet under
  `docs/references/photos/`, registered in `tools/photo-reference-policy.mjs`, with a fixture selftest) is owed once the
  real build exists: the packet needs the as-built envelope.
- Publication status: not published; worktree `~/cot-lanes/twin-aa-269`, branch `item/twin-aa-269` (from 2e24acea0c,
  the 268 round), uncommitted.
- Current next action: builder P authors the measured build and keeps the spatial datums in the spec file (turret and
  gun pivots, fire axes, turret plates, turret-local modules and crew) equal to the geometry; then the combat-anatomy
  update, marking seats, interior fill, presentation anchors, auxiliary inventory and tank assets for this id (generated
  tables the registrar did not write: the browser's lazy anatomy and marking-seat loaders reject an unknown group until
  they exist).

## Scope and preservation

- Mode: new photographic id (real vehicle, no 3D source), release 269, the second air-defence round.
- Owned files (builder P after the registrar): `src/vehicles/loaraSpecs.ts`, `src/vehicles/profiles/loara.ts` (and new files beside it), this packet.
- Shared tables the registrar wrote (the builders do not edit them): fleet manifest, factory loader, registration (and its
  frame-synchronisation hook, which hands the spec the base vehicle's final hull frame after every registration-time
  pass), eager procedurals, fleet order, taxonomy, facets, role profiles, labels, wheel sets, track patterns, marking
  anchors, roof-weapon policy, decorations, internal layouts, interior-fill policy, camo stock, the authored paint
  catalog, audio engine family, the tech tree and shown tiers, and the selftests that pin them.
- Protected: every existing id stays byte-identical (`.qa-dev/geodigest2.mjs` against the registrar's before-digest,
  `~/cot-lanes/twin-aa-269-evidence/R0/`).

## Configuration

The Polish PZA Loara at MSPO Kielce (2004, 2007): the PT-91 hull (six road wheels; check the photographs for the AA
variant's hull sides) under the Loara turret, the two 35 mm KDA on the turret sides in external mounts, the large flat 3D
search radar on a tall folding mast at the turret rear, the round tracking radar on the turret front, smoke dischargers
and sights, in the Polish green, brown and black. Photos 01-05 give the side, the front quarter and the rear quarter;
the hull number "370" is on photo 02.

## Published numbers

| Datum | Value | Source |
| --- | --- | --- |
| Crew | 3 (commander, driver, gunner) | en.wikipedia "PZA Loara" |
| Mass | 45.3 t (en.wikipedia 45 t) | Army Recognition |
| Length / width | 6.67 m / 3.4 m | en.wikipedia |
| Height | 2.19 m, marked dubious on the page (not used) | en.wikipedia |
| Guns | two Oerlikon KDA 35 x 228 mm L/90, 550 rpm each; 1,385 m/s; 4 km against air targets | en.wikipedia; Army Recognition; valka.cz via search |
| Radars | a 3D search radar with IFF, 26 km, 64 targets; the Ericsson Eagle engagement radar (Mk 1 or Mk 2: sources differ) | Army Recognition; search results |
| Engine | S-12U at 850 hp (Army Recognition); S-1000 at 1,000 hp (en.wikipedia, the Loara-A listing) | |
| Speed / range | 60 km/h / 500 km (Army Recognition), 650 km (en.wikipedia) | |
| Production | one production unit and a few prototypes; the one used by Poland withdrawn 2013 | en.wikipedia |
| Gun arc / load | not published | |

## Registration numbers (combat rows are final-intent; spatial datums are the placeholder's)

| Field | Value | Basis |
| --- | --- | --- |
| Tier | VI | coordinator's suggestion; Poland's Twardy line, off the PT-91A Twardy on lane 1 (lane 2 carries the Twardy's run to the Sokół; a drop to lane 4 would cross the Ryś's run to the Zubr) |
| Class / role / status / era | spaa / scout (recon) / prototype / modern | one production vehicle and prototypes, no series |
| HP, engine, weight | 2,550 / 850 hp / 45.3 t | Army Recognition |
| Speed, reverse, traverse | 60 / 20 km/h (the Twardy's reverse) / 34 and 72 deg/s authored | |
| Gun arc | -10 / +85 degrees, 50 deg/s | not published: the Gepard's, the same Oerlikon-pattern twin 35 mm |
| 35 mm | APDS-T 146/131/117 mm, 61 dmg, 1,385 m/s, 40 rounds; HEI-T (HE channel) 56 dmg, 1,175 m/s, 640 rounds; 0.35 s | the Gepard 1A2's KDA rows and load (not published for the Loara) |
| Dimensions | hull 6.67 m, overall 7.00 m (estimate: the placeholder's muzzles), width 3.40 m, height 3.40 m radar folded (estimate) | en.wikipedia; estimates |
| Fire axes | twin, x = +/-1.40 m; muzzles 3.40 m ahead of the trunnion (placeholder, the Gepard placeholder's numbers) | |
| Turret | box 2.20 x 1.01 x 2.80 m, 25/30 mm | placeholder |
| Hull frame | the Twardy's final frame (the T-72B3 frame `fleetRenewalSpecs.ts` gives it), through `synchronizeLoaraFrame` | |
| Paint | spec coat and stock: `sig_pt91_twardy`, the PT-91 Twardy's Polish green, sand and black | no new paint |
| Marking | hull left anchor, number "370" (photo 02) | |
| Wheels / track | the Twardy's (`WHEEL_STANDARD_EXCEPTIONS`, donor pl01, not Poland's IFV wheel); its single-pin track (`trackPatterns.ts`) | |
| Audio | `diesel_v12_soviet` (the S-12U) | |
| View / camouflage | 455 m, 0.220 / 0.190 | |

## Photographic references

Saved under `~/cot-lanes/twin-aa-269-evidence/photos/loara/` (comparison only; never shipped). The owner's photo is the trade-show view.

| # | Wikimedia Commons file | Author | Licence | Date |
| --- | --- | --- | --- | --- |
| 01 | [PZA Loara MSPO2004 PICT0150.JPG](https://commons.wikimedia.org/wiki/File:PZA_Loara_MSPO2004_PICT0150.JPG) | Pibwl | CC BY-SA 4.0 | 2004-09-02 |
| 02 | [Loara PICT0104.jpg](https://commons.wikimedia.org/wiki/File:Loara_PICT0104.jpg) | Pibwl | CC BY-SA 4.0 | 2007-09-03 |
| 03 | [PZA Loara MSPO2004 PICT0146c.jpg](https://commons.wikimedia.org/wiki/File:PZA_Loara_MSPO2004_PICT0146c.jpg) | Pibwl | CC BY-SA 4.0 | 2004-09-02 |
| 04 | [Loara Kielce.png](https://commons.wikimedia.org/wiki/File:Loara_Kielce.png) | Steifer | CC BY 3.0 | Sept 2007 |
| 05 | [PZA Lora Kielce.jpg](https://commons.wikimedia.org/wiki/File:PZA_Lora_Kielce.jpg) | Steifer | CC BY 3.0 | 2007 |

## Construction work order (builder P)

- Replace the placeholder with the measured build on the base vehicle's own hull and running-gear builders (default-off
  options only, every sharing id byte-identical by digest); keep the spec's turret and gun pivots, fire axes
  (`gun.muzzles`), turret plates, turret-local modules and crew boxes equal to the geometry.
- Clear the guns, radars and fittings through the whole pitch range at every yaw (a clearance probe in the group's own
  selftest, as `profiles/chineseAirDefense.selftest.mjs`).
- Then the generated tables for this id: combat anatomy (`npm run tank:anatomy:update` and `check`), marking seats,
  interior fill, presentation anchors, auxiliary inventory, tank assets; and the photographic packet registration.
