# ISU-122S (`isu122s`)

**Exact variant modeled:** ISU-122S (Object 249), late-1944 production on the
IS-2 chassis, 122 mm D-25S L/48.6 with double-baffle muzzle brake and the
compact BALL mantlet (vs the ISU-122's big flat-front shield).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.77 m | tanks-encyclopedia.com/ww2/soviet/isu-122.php; globalsecurity.org/military/world/russia/isu-122s.htm |
| Overall length (w/ gun) | 9.85 m | en.wikipedia.org/wiki/ISU-122; military-history.fandom.com/wiki/ISU-122 |
| Width | 3.07 m | Wikipedia; globalsecurity |
| Height | 2.48 m | Wikipedia; globalsecurity |
| Gun | 122 mm D-25S L/48.6 (~5.93 m tube), double-baffle brake, ball mantlet | Wikipedia; tankarchives.com/2019/10/isu-122s-acceptance.html |
| Running gear | 6 twin steel wheels/side (~0.55 m), 3 return rollers, REAR drive, 0.65 m tracks | Wikipedia (IS chassis); tanks-encyclopedia |

## Identity cues

- Same hull + casemate as ISU-152 (full-width, ~30° front plate, ~15° sides,
  flat roof, offset-RIGHT gun mount).
- Gun mount: rounded cast ball shield, smaller/lighter than the ISU-122's
  boxy shield (D-25's shorter recoil buffer — Tank Archives). Slim 122 mm
  tube with a recoil sleeve step near the root.
- Muzzle: German-pattern DOUBLE-BAFFLE brake — the fastest tell vs ISU-122.
- Everything else per isu152.md: fuel drums, fender boxes, 6 steel wheels +
  3 rollers, rear drive, two roof hatch domes + periscopes.

## Reference links

1. https://en.wikipedia.org/wiki/ISU-122 — dims, D-25S variant notes
2. https://tanks-encyclopedia.com/ww2/soviet/isu-122.php — mantlet/brake cues
3. https://www.tankarchives.com/2019/10/isu-122s-acceptance.html — D-25S fit
4. https://www.globalsecurity.org/military/world/russia/isu-122s.htm — table

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/isu122s.glb` (fixedMount,
recovered print). Width-normalized to 3.07 m: 9.88 m overall × 2.38 m tall —
overall length matches the real 9.85 m almost exactly. Shows the long slim
tube + brake, ball mantlet, fuel drums and the IS wheel train. Fused mesh:
component masks N/A.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | whole | tracks | change |
|---|---|---|---|---|---|
| 2026-07-30 | 85.2 | 79.5 | 85.6 | 83.7 | baseline (parametric CASEMATE box) |
