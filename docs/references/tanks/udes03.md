# UDES 03 (`udes03`)

**Status:** prototype facet (kept). The record is thin: an early-1970s UDES group study with Bofors and Hägglunds for a light
hydropneumatic tank destroyer; sources disagree on whether it passed the drawing board. No layout drawing is public, so the
274 build is the project's own reading.

## 274 redesign (owner 2026-11-20: "redesign the strv 103s and udes")

Before: a small Strv 103 (the 103's front-engine louvred glacis, its four-wheel course with front drive, glacis rams).
After (`src/vehicles/profiles/udes03.ts`), its own vehicle on the period's Swedish light automotive class (the Ikv 91
generation):
- rear engine: a sharp nose, a long clean upper glacis, a grille deck over the rear bay and an exhaust grille on the plate;
- a low central casemate with sloped faces carrying the fixed 105 mm over the glacis (bore 1.64), its cast collar and
  sleeve; the autoloader hump behind it with its reloading hatch;
- six 0.60 m road wheels a side on hydropneumatic arms, rear drive, front idler, no return rollers, a rubber skirt;
- the commander's low cupola (right) with its working Ksp 58, the gunner's sight (left), the driver's hatch on the glacis,
  smoke banks on the casemate corners, fender bins.
Stats, era and dims unchanged (hull 5.91, overall 7.65, width 2.85, height 1.90); the spec's gun mount follows the bore to
1.64. Receipt: `src/vehicles/profiles/udes03Fidelity.selftest.mjs`.

## 274, second pass: the S-tank's trials prototype (owner 2026-11-20: "redesign the udes to be more like a prototype of the strv 103a")
The separate rear-engined build is retired. The UDES 03 is now mark `p` of the family casemate
(`src/vehicles/profiles/strv103Family.ts`): the A hull and running gear, its shorter 105 mm test tube (muzzle 4.13, the
published 7.65 overall), bare fenders without the production bins or Ksp box, plain lamps, bolted ballast plates on the
glacis, the trials data recorder with its cable runs, the telemetry mast and trials weld seams. Dims move to the S-tank
frame (hull 7.04, width 3.60, height 2.14); its stats are unchanged. `profiles/udes03.ts` is deleted.
Owner 2026-11-20 (via Main, "match the S-tank"): on the 103A frame the trials prototype weighs and runs like it: 37.0 t
(was 17.5) and 58 km/h (was 72); the rest of its stats unchanged. physics-torture drive-trench: 3 flights -> 0 (step 0.142 m).
