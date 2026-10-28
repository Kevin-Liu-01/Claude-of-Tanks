# Challenger 1 Mk 2 (`challenger1_mk2`) — release 262 historical rebuild

## Current status

- Updated: 2026-10-27 (lane item/vickers-cr1-262, target release 262).
- Owner request: "also update/redesign the centurions and strv 81, vickers, leopard challenger 1 mk 2, longwei, type 59,
  turrets and hullls as well based on proper historical referrences so they will no longer look so chungus as well"
  (2026-10-27); mid-lane: "really lock in manntlets and stuff and turret boxes and stuff".
- Implementation: new first-party hull, running gear, turret and L11A5
  (`src/vehicles/profiles/challenger1Historic.ts`, `challenger1HistoricTurret.ts`, datums in
  `challenger1HistoricFrame.ts`), shared with the Granby variant ([challenger1_granby.md](challenger1_granby.md)). The oracle-fitted
  build (stage-by-stage slab work against the recovered print, finished by a 1.12 x 0.84 x 1.0 turret squash) is
  retired; its history is [challenger1.md](challenger1.md).
- Qualification: see the lane's READY report (receipts, release gate, critics). The registered geometry-gate oracle
  (`/models/tanks/community/recovered/challenger1.glb`, a print) is not the target any more: the target is the real
  vehicle below. Its score is reported, not chased.
- Publication: none from this lane (the integrator lands release 262).

## Sources

| Ref | What | Licence / access |
|---|---|---|
| S1 | Challenger 1 Mk III four-view drawing, the-blueprints.com `mbt-challenger-1-mk3.gif` (523 x 528) | free preview, measured only |
| S2 | Bovington 64 KG 87 (Mk 3, desert), front-left and elevated rear-right, Commons, Morio | CC BY-SA 4.0 |
| S3 | Bovington 64 KG 87, front, Commons "Challenger 1 MBT Mark 3 (4536087077)", Simon Q | CC BY 2.0 |
| S4 | Bovington gate vehicle 05 SP 52, skirts off, Commons, Roland Turner | CC BY-SA 2.0 |
| S5 | IFOR 1996 plan view, Commons `Challenger1MBT.JPEG` | public domain |
| S6 | Dimensions: en/de/fr/pl Wikipedia "Challenger 1"; arcaneafvs.com; armedconflicts.com; armyrecognition.com fact sheet; FAS | text |
| S7 | Royal Ordnance L11 (Wikipedia): 6.604 m, 55 calibres, +20/-10, sleeve, evacuator, MRS | text |

Measurement method: S1 side and top views scaled on the 8.33 m hull (47.1 px/m; ground y 167.5, nose x 439); the
side profile was also traced column by column. Photos fixed the shapes the drawing cannot (turret front, TOGS, the
mesh basket, the boot, the guards).

## Gap table — before (print-fitted build) / source / now

| Quantity | Before (main 260) | Source | Now (262) |
|---|---:|---:|---:|
| Hull length | 8.22 m armour (8.36 with tail kit) | 8.32–8.33 m (S6) | 8.31 m armour (nose 4.165, tail -4.14) |
| Overall, gun forward | 11.60 m | 11.56 m (S6) | 11.60 m (muzzle 7.39) |
| Width over skirts | 3.53 m | 3.52 m (S6) | 3.52 m (skirt face ±1.76) |
| Width over tracks | 3.07 m | 3.42 m (S6) | 3.42 m (650 mm track, 2.77 m centres) |
| Height, turret roof | 2.42 (2.74 plateau squashed by 0.84) | 2.50 m (S6) | 2.48 m |
| Height, commander's sight | ~2.75 | 2.95 m (S6) | 2.95 m (sight head) |
| Turret width (armour) | **3.70 m** (1.12 squash) | ~2.55–2.75 m (S1 plan; 0.77 x hull width in S1 front) | **2.56 m** body, 2.90 over bins |
| Turret length (armour) | 4.95 m | ~4.2 m body + bins (S1 plan) | 4.06 m body, 4.51 with the bustle bin and basket |
| Turret wall height | 0.74 m (squashed) | ~0.85 m (S1 side) | 0.87 m (0.62–0.66 m walls over the ring housing) |
| Ground clearance | 0.52 | 0.50 m (S6) | 0.50 |
| Road wheels | 6 x r 0.395 on 0.88 m | 6 aluminium, ~0.80–0.85 m, ~1.0 m pitch (S1, S6) | 6 x r 0.42 on 0.98 m (4.9 m on the ground) |
| Return rollers | none (FSP-03 deferred) | 2 a side (S6) | 2 a side behind the skirts |
| Sprocket / idler | rear (-2.64, 0.80) / front (3.62, 0.80) | rear sprocket high, front idler (S1) | rear (-3.30, 0.80) / front (3.66, 0.70) |
| Skirts | 1.62 top, single plane | aluminium skirts to about hub height; front armoured section (S2, S4) | armoured front section raked over the idler to the bow, five rear panels, 1.42 top on the track-guard ledge |
| Glacis | one plate, 1.19 → 1.575 | long shallow upper glacis, short steep nose (S2, S3) | 19° upper glacis 1.58 → 1.10, steep nose plate, lower nose plate to the belly |
| Turret front | oracle wedge with a sight plinth | stepped wedge: cheeks turned in, nose plates to a gun slot, no external mantlet (S3, S7) | cheeks 35° from the 1.10 station, nose plates 18° to a 0.50 m slot |
| Mantlet / gun port | static cradle + collar | slot behind a dust cover (S2, S3) | drum shield turning about the trunnion in the slot + recessed canvas boot (`gunMountCloth`) |
| TOGS | sight block on the roof | armoured barbette, right front corner, door at the front (S3) | 0.55 x 1.0 m barbette on the right front corner, 0.14 m over the roof, door and glass, two struts |
| Cupola | at +x (vehicle left) | commander right (S6: commander right, loader left) | commander's cupola right (-x), loader's hatch left |
| Smoke dischargers | stacked clusters + decor pair | 5 a side on the front cheeks (S6) | two L8 banks of five on the cheek fronts; decor pair removed |
| Turret stowage | slab bins, rear basket rails | mesh-faced bins, left-front mesh basket, bustle basket (S2, S5) | lidded flank bins (hinge, latches), mesh basket wrapping the left cheek, bustle bin + cam-net roll |
| L11A5 | uniform tube | thermal sleeve, evacuator, MRS (S7) | sleeve tapering 0.24 → 0.19 m with straps, extractor at mid-length, MRS mirror |
| Engine deck / exhausts | louvre slab | raised deck, two grille banks (S2) | two rows of four louvred grilles; rear-plate exhaust louvres (inferred from CR2, S6) |

## Decisions and open items

- Exhausts: no CR1 source places them; the rear-plate louvres follow the Challenger 2 hull (S6). Open.
- The decor kit no longer draws a smoke pair, a whip, bow hooks (their bow slot left them in the air) or turret-side
  track links (the flanks are bins, basket and barbette). It keeps the rear-deck tarp and rations and the bucket; the IR
  light is off the list too.
- Fairness: see the lane report (the tier VIII strength line before and after).
