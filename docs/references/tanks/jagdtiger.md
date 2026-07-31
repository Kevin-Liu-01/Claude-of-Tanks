# Jagdtiger (`jagdtiger`)

**Exact variant modeled:** Panzerjäger Tiger Ausf. B (Sd.Kfz. 186), Henschel
suspension, 12.8 cm PaK 44 L/55, 1944–45 production. No muzzle brake on the
production tube; spare-track hangers on the casemate sides.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.38 m | en.wikipedia.org/wiki/Jagdtiger; panzerworld.com/jagdtiger |
| Overall length (w/ 12.8 cm gun) | 10.654 m | Wikipedia; tanks-encyclopedia.com/ww2-germany-sd-kfz-186-jagdtiger/ |
| Width | 3.625 m | Wikipedia (3.6 m); tanks-encyclopedia (3.625 m) |
| Height (casemate roof) | 2.945 m (2.8–2.95 across sources) | Wikipedia 2.8 m; tanks-encyclopedia 2.945 m |
| Gun | 12.8 cm PaK 44 L/55 (~7.0 m tube), no brake in service | Wikipedia; tankmuseum.org/tank-nuts/tank-collection/jagdtiger/ |
| Running gear | 9 interleaved 0.80 m steel-rim stations/side, FRONT drive sprocket, rear idler, 0.80 m tracks | Wikipedia (Tiger II chassis); panzerworld.com |

## Identity cues

- Casemate: integral with the hull sides — side plates rise vertically-ish
  (~25° in) from the sponson line; front plate leans back ~15°; roof carries
  two periscope humps, loader hatch, round commander hatch, close-defense
  mount and vent dome; rear plate slopes with a big round access hatch.
- Gun mount: massive cast "pot" collar (Topfblende-style) bolted proud of the
  15° front plate; the 12.8 cm tube in a stepped sleeve; travel lock on the
  glacis; no muzzle brake.
- Hull front: Tiger II two-plate bow — long 50° glacis meeting a short lower
  nose plate; bow MG ball right, Bosch blackout light left.
- Running gear: 9 interleaved wheels/side (steel-rimmed dished), front
  sprocket, wide 0.80 m tracks, full-length fenders with tools and jack.
- Signature equipment: spare track links racked on BOTH casemate sides, twin
  shrouded exhausts on the rear plate, tow cable runs on the sponsons.

## Reference links

1. https://en.wikipedia.org/wiki/Jagdtiger — dims, chassis, armament
2. https://tanks-encyclopedia.com/ww2-germany-sd-kfz-186-jagdtiger/ — plate
   angles, fittings, production notes
3. https://tankmuseum.org/tank-nuts/tank-collection/jagdtiger/ — surviving
   vehicle (Henschel), walkaround photos
4. https://panzerworld.com/jagdtiger — dimensional tables

## Local GLB oracle notes

Path: `public/models/tanks/community/jagdtiger-adipriatna.glb` (fixedMount).
Width-normalized to 3.7 m the oracle spans 9.95 m overall × 2.87 m tall —
its gun is ~0.7 m SHORTER proportionally than the real 10.65 m vehicle. The
oracle carries the full Henschel interleaved wheel train, fender line, and a
tall casemate whose roof sits well above the r1 procedural (2.36 m). Fused
single mesh: hull/turret/gun components report N/A; scored surface is the
whole silhouette + tracks band.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | whole | tracks | change |
|---|---|---|---|---|---|
| 2026-07-30 | 85.0 | 79.6 | 84.5 | 87.4 | baseline (parametric CASEMATE box) |
| 2026-07-30 | 88.9 | 86.9 | 88.9 | 89.0 | bespoke rebuild: Tiger II bow + sponson box, narrowed 21°-side casemate (base 3.08/roof 2.20), pot mantlet on bolted ring (sealed −7.5/+15°), 9 interleaved dished wheels + front drive, fenders/tools/exhausts/spare-track side racks, two-section 12.8 cm tube to the oracle's +6.26 muzzle |

Remaining gap: left/right 86.4-ish — the oracle's tube is ~0.7 m shorter
proportionally than the real 10.65 m gun; matching it caps identity (kept
at the oracle length). Zimmerit is paint-level (visual flag not owned by
this module).


## Geometry gate v9 (2026-07-31, from-scratch agent)

Two-layer rebuild (tub + 21deg leaned casemate, deck 1.81 per the oracle,
slim pot, fat muzzle-brake drums; fenders to the oracle's +3.7 nose line).
v9: min 34.3 (hull=whole 34.3, stations 54.2, dims 85.4, floaters 100).
Known-good levers left: casemate crown width (front rows still +0.2-0.3 at
|x| 0.9-1.4), tail-plate band tuning for the last hullLengthM points
(measured 8.00 vs 7.8), humps at 2.93 measured 2.85-2.92 (p95 discount).
SHORT-BARRELLED ORACLE: muzzle +6.06 vs published overall 10.65 (build
carries +6.37) — wholeCurves keeps ~3 cover columns by contract.


## Geometry gate v10 round-2 (2026-07-31)
Round-2 row: hull 31.1 whole 31.1 turret 100 (fixedMount) stations 53.6
dims 99.7 floaters 100 (ledger: 34.3/34.3/100/54.2/85.4/100).
Dims closed: the print's 8.06 m body span is longer than published 7.8 —
bow tip pulled to +3.80, tail foot to -3.98, KIT.fenders z-span trimmed to
+3.58 (the fender plane was the hidden hullLengthM carrier: fender + glacis
share side columns and the band rule includes gaps), rear exhausts tucked;
brake moved to published overall 10.65; periscope/vent humps raised to
published heightM 2.95 (p95 at 2.975).
NOTE: hull/whole dipped ~3 pts with the span trim (the print's longer bow
now reads as ~2 REF-only columns) — the dims trade is sovereign and the
cost is certified: short-vs-print span ~0.26 m = cover ~1.5-2% on side rows.
front_hull (31.1, mean 5.1%) is live authoring work (casemate face/side
widths), not a cap.
