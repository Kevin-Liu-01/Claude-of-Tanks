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
