# Lighting and sharpness against the 1049e4e reference (2026-09-13)

Owner: "1049e4e honestly looks a lot better than the current version of the
game, on low graphics too … the lighting is piss poor". The shadow flashing
itself was a culling bug, fixed and deployed earlier today
(`shadow-rework-20260913.md`). This note is the identical-pose A/B that
followed: the reference build (checkout of 1049e4e, dev server 5199) against
production (deploy 11) with the same external camera pose on three maps
(`.qa-dev/ref-ab-shot.mjs --pose=…`, 1920×1080, desktop tier), then in-page
variants on production at the same pose (`.qa-dev/look-ab.mjs`,
`.qa-dev/motion-ab.mjs`) with the quality governor pinned.

## What was identical

Sky and horizon bands (rows 60–300 of 1080) match to the pixel on all three
maps: same fog density and colour, same tone mapping and exposure, same
environment intensity, same cloud layer. The "skybox/horizon" part of the
brief is already at parity with the reference at these poses.

## What differed

Band statistics over the frame (mean luminance, saturation, standard
deviation, and the mean absolute horizontal luminance gradient as a
sharpness proxy), A = reference, B = production:

| map | band | lum A/B | sd A/B | gradient A/B |
| --- | --- | --- | --- | --- |
| verdant | 400–600 | 129.1 / 126.6 | 44.6 / 40.9 | 20.8 / 11.5 |
| verdant | 600–900 | 111.1 / 110.2 | 47.7 / 38.8 | 32.3 / 16.9 |
| alpine | 400–600 | 166.4 / 160.2 | 35.6 / 34.1 | 10.1 / 6.2 |
| alpine | 600–900 | 132.7 / 123.4 | 73.5 / 73.6 | 23.5 / 14.7 |
| fjord | 600–900 | 64.3 / 50.9 | 46.2 / 25.9 | 25.1 / 11.5 |

Two causes, both measurable:

1. **Sharpness.** Production runs temporal AA (added 2026-09-12; the
   reference had SMAA only). At a still pose, TAA alone halves the ground
   gradient (verdant 27.8 → 17.1 with TAA on/off on production). A converged
   TAA frame is the scene box-filtered over the pixel footprint — correct
   anti-aliasing, but every AAA renderer pairs it with a contrast-adaptive
   sharpen, and ours ran RCAS at 0.12 at native resolution. In-page sweeps:

   | variant (alpine, still) | gradient 400–600 | gradient 600–900 |
   | --- | --- | --- |
   | TAA + RCAS 0.12 (production) | 6.27 | 14.75 |
   | TAA + RCAS 0.35 | 7.03 | 15.75 |
   | TAA + RCAS 0.42 | 7.26 | 15.87 |
   | TAA + RCAS 0.60 | 8.08 | 16.37 |
   | TAA off | 8.42 | 20.31 |

   0.35–0.60 recovered contrast without halos (2× crops of tanks, poles and
   grass on verdant were clearly crisper at 0.60); 0.60 began to grain snow.
   Camera motion added no blur on top (moving vs still gradient 14.84 vs
   14.76 at 2.5 m/s), so the history filter did not need changing.

   **Landed:** `reconstructionSharpness(scale, temporalAccumulation)` lifts
   RCAS to `TEMPORAL_RECONSTRUCTION_SHARPNESS = 0.5` whenever the temporal
   pass is enabled; the enlargement policy above the floor is unchanged and
   the non-TAA path (Low, mobile) keeps its 0.12.

2. **Key/fill ratio.** At 1049e4e the battle inherited the garage's sun on
   every map: 4.5, near-white `#f3ecd9`, hemisphere 0.32 (+ bounce floor),
   because the per-map sky presets were not re-applied on battle start. The
   current build applies them, and several maps carry a dim, orange key with a
   high hemisphere fill (alpine 2.85 / `#ffddbe` / 0.54, fjord 3.35 / 0.52,
   monsoon 2.9 / 0.54, caldera 3.5 / 0.64 …). Sun-to-fill ratios around 4:1
   read flat and murky next to the reference's ~10:1; verdant, which already
   used 4.5 / 0.32, matched the reference in luminance. In-page on alpine,
   `setSun` with the reference values raised the near-band luminance
   122 → 129 with no highlight clipping (0.00 % of pixels ≥ 240 in any
   variant; ACES handles the snow).

   **Landed** (`src/world/maps/*.ts`): alpine 4.2 / `#f8eedb` / 0.34,
   fjord 4.2 / `#f7ecd9` / 0.36, caldera 4.0 / `#ffc9a0` / 0.42,
   monsoon 3.6 / `#fae8d0` / 0.46, delta 4.1 / `#fbeed6` / 0.34,
   blackglass 3.9 / `#ffc697` / 0.32, foundry 4.2 / `#fde3c4` / 0.36,
   mangrove key 3.7 → 4.0 (inherits delta's colour and fill). Winter,
   railyard and whiteout keep their overcast presets on purpose. Dev-server
   vs production shots at identical poses: no map clips highlights; caldera's
   deep-shadow share rises 0.9 → 3.6 % (basalt under trees), accepted.

## Tooling (QA only, untracked)

- `.qa-dev/ref-ab-shot.mjs` — identical-pose shot + scene census.
- `.qa-dev/look-ab.mjs` — in-page variants (sun/hemi via `setSun`, TAA
  toggle, RCAS override through a uniform getter) with the quality governor
  suspended and dynScale pinned, which the first run showed is mandatory.
- `.qa-dev/motion-ab.mjs` — the same while strafing the external camera.
- `.qa-dev/band-stats.mjs`, `.qa-dev/clip-stats.mjs`, `.qa-dev/crop.mjs`,
  `.qa-dev/pair.mjs` — band statistics, clipping share, 2× crops, side-by-side.

## Deploy 12 (2026-09-13 21:48 PDT, 471c7b709)

Manual Vercel deploy from the gate checkout; bundle `main-Dn3sjcid.js` →
`main-CqOcRcpE.js`. Production verification: render-truth cull parity 0 and
determinism 0 (shadow pixels 54,865); identical-pose ground gradient
alpine 6.23 → 7.73 / 14.78 → 16.87, verdant 11.50 → 13.37 / 16.88 → 19.77
against deploy 11. Gate 17 on 471c7b709: pre, post and build green; core's
one failure was the garageArchitecture 100 ms headless build budget under the
eight parallel workers (433 ms), which passes 3/3 on a quiet machine.

## Prop census attribution (same poses)

The earlier "unnamed instanced −14…−21 %" reading was a restructure, not a
thinner world. With the census keyed by vertex count and capacity:

- verdant: the 360-vertex per-tree class at 1049e4e (1,011 = one per tree)
  is today's named `canopyProxy` (907); bushes (`v324`) rose 1,276 → 1,470;
  ground litter (stones, clods, splinters: 1,273 visible) is new; trees at the
  pose 1,011 → 907.
- fjord: vegetation alpha cards 58,993 → 54,162 visible (−8 %); a 360-vertex
  solid vegetation class with a 60,740-instance pool at 1049e4e (1,597 visible)
  has no production counterpart — the one census line still worth a look;
  trunks 6,074 → 5,766, props +30…39 %, litter new.

## Water bodies on deploy 11 (near-water poses, production)

Reservoir and oasis read as one saturated, uniform sheet at mid distance:
the depth ramp to the map's shallow colour is narrow, there is little
low-frequency colour variation, and the far shore reflects as a thin band.
Fjord is a dark cold teal (right for the map); coastal's near-water pose
framed the tree line instead of the bay. Candidate pass 5: wider shallow
ramp per map, a low-frequency turbidity/colour-variation term, and a wet
shoreline band — after the sharpness/lighting deploy.

Deploy 13 (2026-09-14, 24418ce08, bundle `main-BRGBR8Ne.js`) carried the
countdown rework, water pass 5 and the tank primitive review on top of this
batch; see `tank-primitive-review-20260913.md`.
