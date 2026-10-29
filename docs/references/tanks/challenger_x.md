# FV4030/5 and FV4030/6 (`challenger_x`, `challenger_x_sleek`) — release 262, fictional

## Current status

- Added 2026-10-28 (lane item/vickers-cr1-262, target release 262). These are fictional tanks. The lane rebuilt the
  Challenger 1 Mk 1 and Mk 2 (and a Granby variant) from historical references; the owner then ruled (2026-10-28):
  "like the challenger 1 mk 3 that is currently there, that turret is what it is actually like, and we should just use the weird turrets we invented to make nnew tanks like action X variants or connqueror orr smthg". The real marks now ride the Mk 3's supplied-file build ([challenger1_mk2.md](challenger1_mk2.md)); the
  rebuilt hull carries these two.
- Designations (owner 2026-10-28: "make the challenger x vairants have proper numerical or fv designations"): the
  numbers after the Challenger 1's FV4030/4 in the Shir line (FV4030/2 Shir 1 / Khalid, FV4030/3 Shir 2). Neither
  FV4030/5 nor FV4030/6 belongs to a real vehicle (Wikipedia's list of FV series vehicles; no source found for
  either). The ids stay `challenger_x` and `challenger_x_sleek`; the names "Challenger X" and "Challenger X Sleek" stay
  as search aliases.
- FV4030/5 (`challenger_x`, the Granby id re-keyed): the wide wedge turret (round 5: main's old Mk 2 width, slope
  and side stowage on the rebuild) and an applique kit after the Op Granby fit (side cassettes, nose blocks, rear drums).
  The Challenger 1's combat row with the late hull front; tier VIII, the Challenger line's lane 4 off the Chieftain Mk 10.
- FV4030/6 (`challenger_x_sleek`): the sleek turret on the plain rebuilt hull (owner 2026-10-27: "a very sleek
  turret and good looking hull"). The Challenger 1's combat row with the early hull front; tier VIII, lane 5 off the
  Chieftain Mk 10.
- Implementation: `src/vehicles/profiles/challenger1Historic.ts` (marks `'x'` and `'x_sleek'`), `challenger1HistoricTurret.ts`,
  `challenger1SleekTurret.ts`, datums in `challenger1HistoricFrame.ts`; armour `challenger1Armor.ts`
  ([challenger1_mk2.md](challenger1_mk2.md), "Armour estimates").
- The applique is drawn; it is not charged as its own armour zones. Owed.
- Names: "X" after the owner's words; no real Challenger carried these turrets.

## The X Sleek's turret

- What it is: the rebuilt historical hull and running gear ([challenger1_mk2.md](challenger1_mk2.md); the hull the owner
  liked) under a new sleek turret (`src/vehicles/profiles/challenger1SleekTurret.ts`) drawn in the earlier Challenger 1
  build's design language ([challenger1.md](challenger1.md)): the asymmetric crown (commander's plateau high on the right,
  loader's roof lower on the left, a rolled ramp between), cheeks swept hard back from a pointed gun nose, long low
  raked-nose bins, a stepped bustle with its rack. One faceted cast loft: an undercut foot hides the ring as a shadow line, a vertical lower band rises to a crease, and
  the upper wall rakes in 24 degrees under an even 6 cm roll. It is 2.40 m over the crease (the earlier build's casting
  was 3.70 m after its 1.12 x 0.84 squash). The crown falls from 2.40 m at the cupola to 2.28 m at its own lower
  nose plates, the rear wall is undercut 25 cm, and the bustle is narrowed to 1.1 m with a basket hung off it. TOGS is a
  flat box inside the right cheek line, 9 cm over the roof, its front raked 55 degrees (round 4, a blind critic against
  the photos and the earlier build).
- It shares the gun nose, slot, drum shield, canvas boot and L11A5 with the FV4030/5 (`addChallenger1GunNose`,
  `addChallenger1Gun`), so the gun-port receipt and the gun rig hold the same way.

## The FV4030/5's applique kit (after the Op Granby fit)

Sources (S1–S7 below; the Op Granby notes from en/fr/pl Wikipedia, 1420kh.co.uk, the QRH museum): the Mk 1,
Mk 2 and Mk 3 share the outer hull and turret; the marks differ internally (TOGS fitted from the Mk 2, armoured charge
bins on the Mk 3) and in small stowage. The visible difference the game carries is the 1990–91 Op Granby fit, which the 7th Armoured Brigade's Mk 2s and Mk 3s carried:

| Item | Source | Now (262) |
|---|---|---|
| Side armour | VARMA / Chobham bolt-on panels over the skirts (fr/pl wiki, QRH museum) | six box-section cassettes (0.77 m pitch, 6 cm joints with backers), raised bolted cover plates, a forward cassette stepping up over the idler, hangers on the track-guard ledge; 24 cm proud of the skirts, down to 0.36 m |
| Nose ERA | ROMOR-A on the nose and lower front plate (fr/pl wiki) | a row of eight blocks across the nose plate and a second row on the lower nose plate, on welded frames |
| Rear fuel drums | 2 x 175 L, crosswise on brackets (fr wiki, S5) | two 0.78 x 0.58 m drums centred 0.90 m out, strapped into cradles bolted to the rear plate |
| Decor | — | a canvas roll on the rear deck (the X tanks' list) |

### Dimensions — source / now

| Quantity | Source | Now |
|---|---:|---:|
| Hull length | 8.32–8.33 m | 8.31 m armour (drums to -4.79) |
| Width | 3.52 m over skirts; the Granby kit adds the panels | 3.52 m skirts, 4.07 m over the cassettes |
| Height, turret roof | 2.50 m | 2.48 m |
| Turret armour height | ~0.85 m | 0.87 m (with the ring housing) |
| Turret width | ~2.55–2.75 m | 2.96 m body (round 5), 3.40 over the bins |
| Overall length | 11.56 m | 11.60 m gun forward (12.18 m with the drums) |

## The rebuilt hull: references (written when this build was the Challenger 1 Mk 2)

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

### Gap table — before (print-fitted build) / source / now

| Quantity | Before (main 260) | Source | Now (262) |
|---|---:|---:|---:|
| Hull length | 8.22 m armour (8.36 with tail kit) | 8.32–8.33 m (S6) | 8.31 m armour (nose 4.165, tail -4.14) |
| Overall, gun forward | 11.60 m | 11.56 m (S6) | 11.60 m (muzzle 7.39) |
| Width over skirts | 3.53 m | 3.52 m (S6) | 3.52 m (skirt face ±1.76) |
| Width over tracks | 3.07 m | 3.42 m (S6) | 3.42 m (650 mm track, 2.77 m centres) |
| Height, turret roof | 2.42 (2.74 plateau squashed by 0.84) | 2.50 m (S6) | 2.48 m |
| Height, commander's sight | ~2.75 | 2.95 m (S6) | 2.95 m (sight head) |
| Turret width (armour) | **3.70 m** (1.12 squash) | ~2.55–2.75 m (S1 plan; 0.77 x hull width in S1 front) | **2.80 m** body, 3.18 over the bins (round 5: the owner asked for main's width back) |
| Turret length (armour) | 4.95 m | ~4.2 m body + bins (S1 plan) | 4.20 m body to the slot apex, 4.62 with the bustle bin |
| Turret wall height | 0.74 m (squashed) | ~0.85 m (S1 side) | 0.74 m walls from 1.74 m, the ring housing hidden in their shadow |
| Ground clearance | 0.52 | 0.50 m (S6) | 0.50 |
| Road wheels | 6 x r 0.395 on 0.88 m | 6 aluminium, ~0.80–0.85 m, ~1.0 m pitch (S1, S6) | 6 x r 0.42 on 0.98 m (4.9 m on the ground) |
| Return rollers | none (FSP-03 deferred) | 2 a side (S6) | 2 a side behind the skirts |
| Sprocket / idler | rear (-2.64, 0.80) / front (3.62, 0.80) | rear sprocket high, front idler (S1) | rear (-3.30, 0.80) / front (3.66, 0.70) |
| Skirts | 1.62 top, single plane | aluminium skirts to about hub height; front armoured section (S2, S4) | armoured front section raked over the idler to the bow, five rear panels, 1.42 top on the track-guard ledge |
| Glacis | one plate, 1.19 → 1.575 | long shallow upper glacis, short steep nose (S2, S3) | 19° upper glacis 1.58 → 1.10, steep nose plate, lower nose plate to the belly |
| Turret front | oracle wedge with a sight plinth | arrowhead in plan: cheeks run from the widest point to the gun slot at its apex, about 40 degrees off the centreline (S1 plan, S3) | round 5, main's wedge: full width to 0.60 m, then two cheek plates fall 20 degrees at the wall to a lip at 2.40 m and slope down outward from the gun ridge, which runs level to 1.40 m and falls 19 degrees through the nose plates to the slot at 2.50 m |
| Mantlet / gun port | static cradle + collar | slot behind a dust cover, a nearly cylindrical canvas boot (S2, S3) | drum shield turning about the trunnion in the slot; a 0.38 m canvas boot, 0.30 m of it ahead of the nose, three low folds |
| TOGS | sight block on the roof | armoured barbette on the right cheek's top, set back, the right smoke bank on its front corner (S3) | 0.69 x 0.95 m barbette on the right cheek against the gun ridge, its foot following the cheek's fall, 0.24 m over the roof, door and glass |
| Cupola | at +x (vehicle left) | commander right (S6: commander right, loader left) | commander's cupola right (-x), loader's hatch left |
| Smoke dischargers | stacked clusters + decor pair | 5 a side, proud on brackets, angled up (S3, S6) | L8 banks of five on pedestal blocks at the cheeks' outer front corners, firing forward and 20 degrees out, tubes up 35 degrees (round 5: main's side-mounted banks) |
| Turret stowage | slab bins, rear basket rails | long flush mesh basket on the left wall, bins behind it and behind TOGS, bustle bin with jerrycans (S2, S5) | right: one lidded flank bin from the bustle to the cheek, its nose raked, a strapped net roll on its lid; left: the 1.55 m mesh basket (bedding, kit bag, a jerrycan) and a short bin behind it; bustle bin at roof height with a jerrycan at each end and a strapped bedroll on the lid |
| L11A5 | uniform tube | thermal sleeve, evacuator, MRS (S7) | sleeve tapering 0.24 → 0.19 m with straps, extractor at mid-length, MRS mirror |
| Engine deck / exhausts | louvre slab | raised deck, two grille banks (S2) | two rows of four louvred grilles; rear-plate exhaust louvres (inferred from CR2, S6) |

### Decisions and open items

- Exhausts: no CR1 source places them; the rear-plate louvres follow the Challenger 2 hull (S6). Open.
- Decor: the X tanks lay only a canvas roll on the rear deck (`decorManifestFor`). The fleet cargo's roof cans,
  crates and bags read as clutter against the photos' clean grilles. There is one roof gun, the commander's L37.
- Round 4 (2026-10-27, blind critics against S1-S5): arrowhead front, TOGS set back, long flush basket, the walls down
  over the ring, the boot shortened, the loader's GPMG and its hoop removed, the floating glacis fittings seated.
- Round 5 (the owner, 2026-10-28: "the old challengerr 1 mk 2 has the better turret shape though, that is wider, very
  sloped, good things on side. combine ur new and the old"): main's width and wedge on the round-4 build. The arrowhead
  became full-width cheek plates falling to a low lip and outward from a gun ridge (main's V from the front); the long
  flank bin, the side-mounted smoke banks and the extra stowage carry main's flanks. The slot, drum shield, boot, gun,
  cupola and hatches stay round 4's.
- Fairness: see the lane report (the tier VIII strength line before and after).
