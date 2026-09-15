# Night battle entry — loading-order correction

Runtime checkpoint: `9516ccf65` (source checkpoint `5dcb8c94b`).
This fixes a specific duplicate preparation path, not all environment loading
costs or every nighttime appearance issue.

## Cause and correction

The early solo player was submitted for forward-program compilation before
final camouflage and the selected night lighting. Allied actors were also
compiled before the night light pool was attached. The later two-spot/one-point
light signature required another shader variant.

- Early player staging still uploads textures, prepares burn/armor resources,
  registers the root, and restores visibility. Only that premature forward
  compile is deferred; default staging callers retain their compile.
- Deployment prepares atmosphere and the final night-light pool before allied
  streaming. Existing construction hooks append late allied emitters.
- The final scene compile, shadow and post warmup, cancellation checks, and
  covered successful-frame reveal remain mandatory and unchanged.
- No extra light, shadow map, geometry, texture, precipitation system or
  per-frame work was added by this correction.

## Evidence and its limits

Focused streamer, solo-loading, deployment and acquisition selftests pass.
Deployment tests use actual Three.js light-state setup and the real night
lighting owner: day signatures stay `[0,0]`, night signatures stay `[2,1]`
at both allied and final compilation. Late emitters, failed setup and cancelled
setup have explicit tests. Full no-emit TypeScript and the public build pass
after integration with the original Verdant restoration.

Native first-night acquisition: Urban / M1A3, desktop High, 1440×900,
Chrome 152 / ANGLE Metal, deterministic clear-night seed 2 selected before
the first battle starts. Evidence directory:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/night-entry-order-cold-r1/`.

The report records final night lights before the first completed ordinary
battle render, which remained behind the opaque loading cover. Both driving
spots were active and shadowless; the distant world-light slot correctly had
zero intensity. Early player `compileMs` was zero. One established screenshot
was captured and inspected. There were no console or cleanup errors; the
browser and preview stopped.

**The overall r1 acquisition failed and stays failed.** A later headlight
inspection asserted a generic `mask` field that `NightWindowInspection` does
not return. The probe now checks the selected real mesh triangle's three
uploaded mask values and its owner/material identity instead. CPU fixtures
cover that schema correction. The preserved r1 report must not be relabeled.

The single corrected `night-entry-order-cold-r2/` acquisition passed, using the
same runtime and built-index content. Its three native images were inspected:
two attached driving apertures, an attached street lantern illuminating the
facade/road, and the established night scene. The headlight's real triangle
owner/material/centroid and uploaded `[1,1,1]` masks were verified; the lantern's
actual point-light slot and return-to-Garage reset passed. Console, WebGL and
cleanup errors were empty, and browser/preview/observer cleanup completed.
Report SHA-256: `031b204f9a49b8eabc499e36a31d0ae1ba6ff17a35af0a6333f2e3ef2074d11c`.

This is a bounded first-night and Garage-path check, not every lifecycle or
device combination. Visual review still found an over-bright near-lantern
facade and flat bright distant windows. The natural Roll Out banner partly
obscures the establishing image. Those limitations remain visible in the
saved images; the lighting system is not granted blanket art approval.

The unpaired r1 load was 11,238 ms, including 4,014 ms world acquisition and
6,952 ms warmup. Shadow/geometry and forward-program warmup still dominate.
The same-runtime r2 load was 4,932 ms, with forward warmup 20 ms instead of
r1's 2,713 ms. That uncontrolled compilation/cache difference is precisely why
neither number is a before/after fix speedup. There is no frame-budget, memory,
physical iPad or Safari certification from these runs.
