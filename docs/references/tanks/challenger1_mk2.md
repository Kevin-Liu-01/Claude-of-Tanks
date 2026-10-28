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
| Turret length (armour) | 4.95 m | ~4.2 m body + bins (S1 plan) | 4.20 m body to the slot apex, 4.62 with the bustle bin |
| Turret wall height | 0.74 m (squashed) | ~0.85 m (S1 side) | 0.74 m walls from 1.74 m, the ring housing hidden in their shadow |
| Ground clearance | 0.52 | 0.50 m (S6) | 0.50 |
| Road wheels | 6 x r 0.395 on 0.88 m | 6 aluminium, ~0.80–0.85 m, ~1.0 m pitch (S1, S6) | 6 x r 0.42 on 0.98 m (4.9 m on the ground) |
| Return rollers | none (FSP-03 deferred) | 2 a side (S6) | 2 a side behind the skirts |
| Sprocket / idler | rear (-2.64, 0.80) / front (3.62, 0.80) | rear sprocket high, front idler (S1) | rear (-3.30, 0.80) / front (3.66, 0.70) |
| Skirts | 1.62 top, single plane | aluminium skirts to about hub height; front armoured section (S2, S4) | armoured front section raked over the idler to the bow, five rear panels, 1.42 top on the track-guard ledge |
| Glacis | one plate, 1.19 → 1.575 | long shallow upper glacis, short steep nose (S2, S3) | 19° upper glacis 1.58 → 1.10, steep nose plate, lower nose plate to the belly |
| Turret front | oracle wedge with a sight plinth | arrowhead in plan: cheeks run from the widest point to the gun slot at its apex, about 40 degrees off the centreline (S1 plan, S3) | full width to 1.30 m, cheeks at 37 degrees to the nose plates, which carry the wedge to the slot at 2.50 m; the roof falls 8 degrees over the front metre |
| Mantlet / gun port | static cradle + collar | slot behind a dust cover, a nearly cylindrical canvas boot (S2, S3) | drum shield turning about the trunnion in the slot; a 0.38 m canvas boot, 0.30 m of it ahead of the nose, three low folds |
| TOGS | sight block on the roof | armoured barbette on the right cheek's top, set back, the right smoke bank on its front corner (S3) | 0.50 x 0.95 m barbette on the right cheek's top behind the wedge, 0.24 m over the roof, door and glass |
| Cupola | at +x (vehicle left) | commander right (S6: commander right, loader left) | commander's cupola right (-x), loader's hatch left |
| Smoke dischargers | stacked clusters + decor pair | 5 a side, proud on brackets, angled up (S3, S6) | L8 banks of five on brackets, tubes up 35 degrees: the right at the barbette's corner, the left square to the left cheek |
| Turret stowage | slab bins, rear basket rails | long flush mesh basket on the left wall, bins behind it and behind TOGS, bustle bin with jerrycans (S2, S5) | 1.45 m fine-mesh basket on the left wall, lidded bins behind it and behind the barbette, bustle bin hung at roof height with a jerrycan in a holder at each end |
| L11A5 | uniform tube | thermal sleeve, evacuator, MRS (S7) | sleeve tapering 0.24 → 0.19 m with straps, extractor at mid-length, MRS mirror |
| Engine deck / exhausts | louvre slab | raised deck, two grille banks (S2) | two rows of four louvred grilles; rear-plate exhaust louvres (inferred from CR2, S6) |

## Armour estimates (release 262; ESTIMATES, not official figures)

Main asked on 2026-10-27 for the Challenger 1s to stop inheriting the Challenger 2's armour package. That package was
turret cheeks 600/900 and glacis 500/800 here, against 751/1126 on the Challenger 2 itself after its compensation.
The Chobham figures are still classified, and no official KE/CE values are public. The values below are community
estimates. They are compiled from declassified or unnamed documents, which their posters do not identify. Treat them
as estimates. All values are mm RHA equivalent, given as KE / CE.

| Ref | Source | What it gives |
|---|---|---|
| A1 | War Thunder forum, "Challenger 1 MBT - Technical Data and Discussions", posts of 2026-06-19 by Kobes-Kamov (forum.warthunder.com/t/23266, pages 26-27). Cites figures from an attached image; names no document. | Turret front: 430-500 KE "depending on source"; 500 KE head-on, 430 KE the minimum across about +-20 degrees. Hull front: 300 KE / 580 CE on the early Mk 1 and Mk 2, raised to 350 KE / 700 CE on the late (Desert Storm) Mk 3. |
| A2 | Same thread, 2026-06-19/20, BARElement-psn (in-game protection analysis) | Hull 330-337 KE on the Mk 1/Mk 2 and 350-362 KE on the Mk 3, against 3BM22-type rounds; Mk 3 hull CE 614-750. These are consistent with A1. |
| A3 | War Thunder wiki (old), "Challenger Mk.2", as quoted by the search index (the page now returns 401) | Turret front 470 KE (about 550 without the long-rod modifier) / 600 CE; turret sides 140 KE / 300 CE; upper front plate 220 KE (game value). |
| A4 | War Thunder forum (search summary), another post in the same thread | Turret 480 KE / 600 CE; 435 KE across a 60-degree arc. |

Step 2, the fleet's scale (Main's ruling, 2026-10-27: "put the CR1 estimates on the fleet's own scale, and derive
the factor rather than picking it"). For each zone, the factor is the median ratio of game value to public estimate
over the fleet's sourced Western peers, with KE and CE taken separately because their ratios differ. No packet in
`docs/references` carried armour estimates, so the peers' estimates come from the same class of public sources:

| Peer | Zone | Public estimate KE / CE | Source | Game value KE / CE | Ratio KE / CE |
|---|---|---:|---|---:|---:|
| Leopard 2A4 | turret front | 415 / 750-800 (775) | War Thunder forum, "Leopard 2 composite armour" (forum.warthunder.com/t/74313); the later package, 60-degree arc | 546 / 780 | 1.316 / 1.006 |
| M1A1 (1985) | turret front | 460 / 750 | War Thunder forum (Abrams armour threads), quoting declassified British Chieftain-replacement reports; KE over +-20 degrees, CE over +-27 degrees | 731 / 1075 | 1.589 / 1.433 |
| M1A1 | hull front (non-DU) | 350 / 750 | War Thunder forum, "Hull Armor of the M1 Abrams" (forum.warthunder.com/t/59315), from British and Swedish evaluations | 516 / 645 (lower_front) | 1.474 / 0.860 |

Factors:
- Turret: KE x1.452, CE x1.220 (the median of the Leopard 2A4 and the M1A1).
- Hull: KE x1.474, CE x0.860 (the M1A1 alone; no Leopard 2A4 hull estimate was found).

Ratings (`src/vehicles/challenger1Armor.ts` keeps both the raw estimates and the factors):

| Plate | Before (Challenger 2 package) | Raw estimate | Now (fleet scale) | Basis |
|---|---:|---:|---:|---|
| Turret cheeks (front) | 600 / 900 | 470 / 600 | **682 / 732** | A1 430-500 KE, A3/A4 470-480 KE, 600 CE |
| Gun slot (mantlet_slot) | 450 / 550 | 430 / 600 | **624 / 732** | A1, the frontal arc's minimum |
| Turret sides | 300 / 450 | 140 / 300 | **203 / 366** | A3 |
| Upper glacis and lower front: Mk 1, Mk 2 | 500 / 800 and 300 / 400 | 300 / 580 | **442 / 499** | A1 (early marks), A2 |
| Upper glacis and lower front: Mk 3, Granby | as above | 350 / 700 | **516 / 602** | A1 (the late Mk 3's hull), A2 |
| Everything else (sides, skirts, roof, rear) | Challenger 2 donor | — | unchanged | no source |

The marks differ only in the hull front, which the sources raise on the late Mk 3. The Mk 3 clones the Mk 2's armour
(`sourceXSecondWaveSpecs.ts`) and is then rated late. The Granby variant is the Desert Storm fit and is rated late. The
Mk 1 is rated early.

These numbers are provisional. Progression's fleet-wide gun-face hit-model fix lands last in 262 and moves every
Western gun face, this one included; progression re-measures the tiers after it.

## Decisions and open items

- Exhausts: no CR1 source places them; the rear-plate louvres follow the Challenger 2 hull (S6). Open.
- Decor: the rebuilt marks lay only a canvas roll on the rear deck (`decorManifestFor`). The fleet cargo's roof cans,
  crates and bags read as clutter against the photos' clean grilles. There is one roof gun, the commander's L37.
- Round 4 (2026-10-27, blind critics against S1-S5): arrowhead front, TOGS set back, long flush basket, the walls down
  over the ring, the boot shortened, the loader's GPMG and its hoop removed, the floating glacis fittings seated.
- Fairness: see the lane report (the tier VIII strength line before and after).
