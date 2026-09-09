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
cover that schema correction. One corrected r2 acquisition is queued; headlight
and streetlamp closeups plus that run's Garage reset are still pending. Do not
describe this checkpoint as a completed appearance or lifecycle certification.

The unpaired r1 load was 11,238 ms, including 4,014 ms world acquisition and
6,952 ms warmup. Shadow/geometry and forward-program warmup still dominate.
These are diagnostic observations, not a before/after speedup, frame-budget,
memory, physical iPad or Safari certification.
